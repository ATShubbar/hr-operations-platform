import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import type { GroSequenceModel, GroSequenceStepModel } from '../../../generated/prisma/models';
import { requestContext } from '../../../context/request-context';
import { AuditService } from '../../audit/public-api';
import { EmployeesService } from '../../employees/public-api';
import { SEQUENCES, type SequenceKind } from '../domain/sequence-definitions';
import {
  filedDependents,
  isComplete,
  stepDefinition,
  stepsOf,
  type StepView,
} from '../domain/sequence-engine';

// Onboarding and final-exit sequences (MOB-01, ADR-018). Staff path only (the API
// gates it in MOB-02); the step RULES live in the pure engine, this service makes
// them stick: one running run per employee per kind (also a database index), file
// only ready steps, reopen only without filed dependents, complete when the last
// step is filed, cancel a running run. Every change is audited as `gro-sequence`
// against the EMPLOYEE (so it reaches the Person record's History), in the same
// transaction as the write.
//
// What completion DOES: an onboarding's makes someone mid-mobilisation `active`
// (MOB-04b — see afterCompletion); a final exit's will terminate (MOB-05). So a
// COMPLETED sequence is final — neither kind can be reopened.

export interface SequenceView {
  id: string;
  employeeId: string;
  clientId: string;
  kind: SequenceKind;
  status: 'running' | 'completed' | 'cancelled';
  startedOn: string;
  startedByUserId: string | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  steps: Array<StepView & { filedByUserId: string | null }>;
}

type Row = GroSequenceModel & { steps: GroSequenceStepModel[] };
type Tx = Prisma.TransactionClient;

const day = (d: Date) => d.toISOString().slice(0, 10);
const todayIso = () => new Date().toISOString().slice(0, 10);

function toView(row: Row): SequenceView {
  const filed = Object.fromEntries(
    row.steps.map((s) => [s.stepKey, s.filedOn ? day(s.filedOn) : null]),
  );
  return {
    id: row.id,
    employeeId: row.employeeId,
    clientId: row.clientId,
    kind: row.kind,
    status: row.status,
    startedOn: day(row.startedOn),
    startedByUserId: row.startedByUserId,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    steps: stepsOf(row.kind, day(row.startedOn), filed).map((st) => ({
      ...st,
      filedByUserId: row.steps.find((x) => x.stepKey === st.key)?.filedByUserId ?? null,
    })),
  };
}

function filedMap(row: Row): Record<string, string | null> {
  return Object.fromEntries(row.steps.map((s) => [s.stepKey, s.filedOn ? day(s.filedOn) : null]));
}

@Injectable()
export class SequencesService {
  private readonly logger = new Logger(SequencesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly employees: EmployeesService,
  ) {}

  async listForEmployee(employeeId: string): Promise<SequenceView[]> {
    const rows = await this.prisma.groSequence.findMany({
      where: { employeeId },
      include: { steps: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toView);
  }

  async get(id: string): Promise<SequenceView | null> {
    const row = await this.prisma.groSequence.findUnique({
      where: { id },
      include: { steps: true },
    });
    return row ? toView(row) : null;
  }

  async start(employeeId: string, kind: SequenceKind): Promise<SequenceView> {
    const employee = await this.employees.getById(employeeId);
    if (!employee) throw new NotFoundException('Employee not found');
    if (employee.employmentStatus === 'terminated') {
      throw new BadRequestException('This employee is terminated');
    }
    const actorId = requestContext.get()?.actorId ?? null;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const running = await tx.groSequence.findMany({
          where: { employeeId, status: 'running' },
          select: { kind: true },
        });
        if (running.some((r) => r.kind === kind)) {
          throw new ConflictException(
            `${SEQUENCES[kind].label} is already running for this employee`,
          );
        }
        if (kind === 'final_exit' && running.some((r) => r.kind === 'onboarding')) {
          throw new ConflictException('Onboarding is still running for this employee');
        }
        const row = await tx.groSequence.create({
          data: {
            employeeId,
            clientId: employee.clientId,
            kind,
            startedOn: new Date(`${todayIso()}T00:00:00.000Z`),
            startedByUserId: actorId,
            steps: { create: SEQUENCES[kind].steps.map((s) => ({ stepKey: s.key })) },
          },
          include: { steps: true },
        });
        await this.record(tx, row, 'start', { kind, steps: row.steps.length });
        return toView(row);
      });
    } catch (err) {
      // The partial unique index is the backstop for a race the check above lost.
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException(
          `${SEQUENCES[kind].label} is already running for this employee`,
        );
      }
      throw err;
    }
  }

  async file(id: string, stepKey: string, filedOn?: string): Promise<SequenceView> {
    const on = filedOn ?? todayIso();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(on) || Number.isNaN(Date.parse(`${on}T00:00:00Z`))) {
      throw new BadRequestException('Invalid filing date');
    }
    if (on > todayIso()) throw new BadRequestException('A step cannot be filed in the future');
    const actorId = this.actor();
    const view = await this.prisma.$transaction(async (tx) => {
      const row = await this.load(tx, id);
      if (row.status !== 'running') throw new ConflictException(`This sequence is ${row.status}`);
      const def = stepDefinition(row.kind, stepKey);
      if (!def) throw new BadRequestException('Unknown step');
      const view = stepsOf(row.kind, day(row.startedOn), filedMap(row)).find(
        (s) => s.key === stepKey,
      )!;
      if (view.state === 'filed') throw new ConflictException(`"${def.title}" is already filed`);
      if (view.state === 'blocked') {
        throw new ConflictException(`"${def.title}" is waiting on ${view.waitingOn.join(' and ')}`);
      }
      await tx.groSequenceStep.update({
        where: { sequenceId_stepKey: { sequenceId: id, stepKey } },
        data: { filedOn: new Date(`${on}T00:00:00.000Z`), filedByUserId: actorId },
      });
      await this.record(tx, row, 'file-step', { step: stepKey, filedOn: on });
      let after = await this.load(tx, id);
      if (isComplete(after.kind, filedMap(after))) {
        await tx.groSequence.update({
          where: { id },
          data: { status: 'completed', completedAt: new Date() },
        });
        after = await this.load(tx, id);
        await this.record(tx, after, 'complete', { kind: after.kind });
      }
      return toView(after);
    });
    if (view.status === 'completed') await this.afterCompletion(view);
    return view;
  }

  // What a completed sequence DOES (ADR-018). After the commit, like the events
  // elsewhere: the filing stands even if this fails, and it is logged loudly — a
  // completed onboarding whose person is still `onboarding` is the sign of it.
  //
  //   onboarding (MOB-04b) — someone mid-mobilisation has joined: they become
  //     `active`, with the ARRIVAL date (the "travel" step) as their hire date
  //     unless one is already on file (owner decision). Employees then publishes
  //     EmployeeJoinedEvent, which carries their candidate to `hired`. A DIRECT
  //     call, not an event: GRO already depends on Employees, and Employees
  //     subscribing to a GRO event would be a cycle (the GRO-03 reasoning;
  //     ADR-018 rev. 1). An onboarding started by hand for someone already active
  //     changes nothing here.
  private async afterCompletion(view: SequenceView): Promise<void> {
    if (view.kind !== 'onboarding') return;
    try {
      const employee = await this.employees.getById(view.employeeId);
      if (employee?.employmentStatus !== 'onboarding') return;
      const arrival = view.steps.find((s) => s.key === 'travel')?.filedOn;
      await this.employees.update(
        view.employeeId,
        {
          employmentStatus: 'active',
          ...(employee.hireDate === null && arrival
            ? { hireDate: new Date(`${arrival}T00:00:00.000Z`) }
            : {}),
        },
        'onboarding-complete',
      );
    } catch (err) {
      this.logger.error(
        `Onboarding ${view.id} completed but its employee ${view.employeeId} was not activated`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async reopen(id: string, stepKey: string): Promise<SequenceView> {
    this.actor();
    return this.prisma.$transaction(async (tx) => {
      const row = await this.load(tx, id);
      if (row.status === 'cancelled') throw new ConflictException('This sequence is cancelled');
      // A completed sequence is FINAL — both kinds (MOB-01 for the final exit;
      // MOB-04b, owner decision, for onboarding: its completion has made the
      // person active and their candidate hired, which a reopen would not undo).
      if (row.status === 'completed') {
        throw new ConflictException('A completed sequence cannot be reopened');
      }
      const def = stepDefinition(row.kind, stepKey);
      if (!def) throw new BadRequestException('Unknown step');
      const filed = filedMap(row);
      if (!filed[stepKey]) throw new ConflictException(`"${def.title}" is not filed`);
      const dependents = filedDependents(row.kind, stepKey, filed);
      if (dependents.length) {
        throw new ConflictException(
          `Reopen ${dependents.join(' and ')} first — it was filed on the back of "${def.title}"`,
        );
      }
      await tx.groSequenceStep.update({
        where: { sequenceId_stepKey: { sequenceId: id, stepKey } },
        data: { filedOn: null, filedByUserId: null },
      });
      await this.record(tx, row, 'reopen-step', { step: stepKey });
      return toView(await this.load(tx, id));
    });
  }

  async cancel(id: string): Promise<SequenceView> {
    const actorId = this.actor();
    return this.prisma.$transaction(async (tx) => {
      const row = await this.load(tx, id);
      if (row.status !== 'running') throw new ConflictException(`This sequence is ${row.status}`);
      await tx.groSequence.update({
        where: { id },
        data: { status: 'cancelled', cancelledAt: new Date(), cancelledByUserId: actorId },
      });
      await this.record(tx, row, 'cancel', { kind: row.kind });
      return toView(await this.load(tx, id));
    });
  }

  // MOB-04a (ADR-018): a terminated person's onboarding is over — cancel the run
  // rather than leave a live sequence on someone who has left. (A running FINAL
  // EXIT is left alone: the departure paperwork is still to be done.) Called from
  // the termination event, so there may be no signed-in actor (a system path).
  async cancelOnboardingOnTermination(employeeId: string): Promise<number> {
    const actorId = requestContext.get()?.actorId ?? null;
    return this.prisma.$transaction(async (tx) => {
      const running = await tx.groSequence.findMany({
        where: { employeeId, kind: 'onboarding', status: 'running' },
      });
      for (const row of running) {
        await tx.groSequence.update({
          where: { id: row.id },
          data: { status: 'cancelled', cancelledAt: new Date(), cancelledByUserId: actorId },
        });
        await this.record(tx, row, 'cancel', { kind: row.kind, reason: 'terminated' });
      }
      return running.length;
    });
  }

  private actor(): string {
    const actorId = requestContext.get()?.actorId;
    if (!actorId) throw new BadRequestException('A signed-in actor is required');
    return actorId;
  }

  private async load(tx: Tx, id: string): Promise<Row> {
    const row = await tx.groSequence.findUnique({ where: { id }, include: { steps: true } });
    if (!row) throw new NotFoundException('Sequence not found');
    return row;
  }

  private record(tx: Tx, row: GroSequenceModel, action: string, detail: Record<string, unknown>) {
    return this.audit.record(tx, {
      resource: 'gro-sequence',
      resourceId: row.employeeId,
      action,
      clientId: row.clientId,
      after: { sequenceId: row.id, kind: row.kind, ...detail } as Prisma.InputJsonValue,
    });
  }
}
