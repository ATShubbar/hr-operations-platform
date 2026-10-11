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
import { UsersService } from '../../auth/public-api';
import { ClientsService } from '../../clients/public-api';
import { EmployeesService } from '../../employees/public-api';
import { NotificationsService } from '../../notifications/public-api';
import { EventBus } from '../../events/public-api';
import { SEQUENCES, STEP_CAPTURES, type SequenceKind } from '../domain/sequence-definitions';
import { SequenceStepReopenedEvent } from '../domain/sequence-step-reopened.event';
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
  /** The run's owner (MOB-06a): whose work its ready steps are. */
  assigneeUserId: string | null;
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
    assigneeUserId: row.assigneeUserId,
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
    private readonly events: EventBus,
    private readonly clients: ClientsService,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
  ) {}

  // Who may own a run (MOB-06a): the shared assignee rule (ASSIGN-01) — an
  // active staff account that can work procedures.
  private canOwn(userId: string): Promise<boolean> {
    return this.users.isActiveStaffWith(userId, 'gro.process');
  }

  // A new run's owner: the client's NAMED OFFICER (ADR-019), when there is one
  // and they can still work procedures. Otherwise nobody — the run waits in the
  // queue, unassigned, for someone to take it.
  private async defaultOwner(clientId: string): Promise<string | null> {
    const officer = (await this.clients.getById(clientId))?.officerUserId ?? null;
    return officer && (await this.canOwn(officer)) ? officer : null;
  }

  // Hand a RUNNING sequence to another officer, or to nobody (MOB-06a). Audited
  // against the employee like every other sequence change; the person handed it
  // is told — never about their own act, never on a re-save with the same owner.
  async assign(id: string, assigneeUserId: string | null): Promise<SequenceView> {
    const actorId = this.actor();
    if (assigneeUserId && !(await this.canOwn(assigneeUserId))) {
      throw new BadRequestException(
        'A sequence can only be owned by someone who works on procedures',
      );
    }
    const { view, changed } = await this.prisma.$transaction(async (tx) => {
      const row = await this.load(tx, id);
      if (row.status !== 'running') throw new ConflictException(`This sequence is ${row.status}`);
      if (row.assigneeUserId === assigneeUserId) return { view: toView(row), changed: false };
      await tx.groSequence.update({ where: { id }, data: { assigneeUserId } });
      await this.record(tx, row, 'assign', { kind: row.kind, assigned: assigneeUserId !== null });
      return { view: toView(await this.load(tx, id)), changed: true };
    });
    if (changed && assigneeUserId && assigneeUserId !== actorId) {
      const label = SEQUENCES[view.kind].label;
      await this.notifications.notify({
        recipientUserId: assigneeUserId,
        category: 'general',
        title: { ar: 'أُسند إليك ملف', en: 'A sequence was assigned to you' },
        body: {
          ar: view.kind === 'onboarding' ? 'أُسندت إليك إجراءات تهيئة موظف.' : 'أُسندت إليك إجراءات خروج نهائي.',
          en: `${label} was assigned to you.`,
        },
        data: { sequenceId: view.id, employeeId: view.employeeId, kind: 'assigned' },
      });
    }
    return view;
  }

  async listForEmployee(employeeId: string): Promise<SequenceView[]> {
    const rows = await this.prisma.groSequence.findMany({
      where: { employeeId },
      include: { steps: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toView);
  }

  // Every sequence in one status — the "in flight" lists (MOB-05). Oldest first:
  // the file that has been open longest leads.
  async listByStatus(status: SequenceView['status']): Promise<SequenceView[]> {
    const rows = await this.prisma.groSequence.findMany({
      where: { status },
      include: { steps: true },
      orderBy: { startedOn: 'asc' },
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
    const assigneeUserId = await this.defaultOwner(employee.clientId);
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
            assigneeUserId,
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

  async file(
    id: string,
    stepKey: string,
    filedOn?: string,
    resultingExpiry?: string,
  ): Promise<SequenceView> {
    const on = filedOn ?? todayIso();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(on) || Number.isNaN(Date.parse(`${on}T00:00:00Z`))) {
      throw new BadRequestException('Invalid filing date');
    }
    if (on > todayIso()) throw new BadRequestException('A step cannot be filed in the future');
    // MOB-07: a document cannot expire on or before the day it was issued.
    if (resultingExpiry !== undefined && resultingExpiry <= on) {
      throw new BadRequestException('The expiry must be after the filing date');
    }
    const actorId = this.actor();
    const view = await this.prisma.$transaction(async (tx) => {
      const row = await this.load(tx, id);
      if (row.status !== 'running') throw new ConflictException(`This sequence is ${row.status}`);
      const def = stepDefinition(row.kind, stepKey);
      if (!def) throw new BadRequestException('Unknown step');
      // MOB-07: only a step that issues a dated document takes an expiry. Refused
      // BEFORE anything is written — a rejected request files nothing.
      if (resultingExpiry !== undefined && !STEP_CAPTURES[row.kind]?.[stepKey]) {
        throw new BadRequestException(`"${def.title}" records no expiry`);
      }
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
    // MOB-07: record the expiry of the document this step issued — through
    // Employees, audited like a procedure's completion (GRO-03). After the commit,
    // and BEFORE the completion effects: a final step's own effect still runs. A
    // failure here is logged and never un-files the step.
    const captured = resultingExpiry ? STEP_CAPTURES[view.kind]?.[stepKey] : undefined;
    if (captured && resultingExpiry) {
      try {
        await this.employees.update(
          view.employeeId,
          { [captured.field]: new Date(`${resultingExpiry}T00:00:00.000Z`) },
          'gro-completion',
        );
      } catch (err) {
        this.logger.error(
          `Step ${stepKey} of sequence ${view.id} was filed but its expiry was not recorded`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
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
  //   final exit (MOB-05) — the person has LEFT: they become `terminated`, by the
  //     same direct call. The termination event closes their account.
  private async afterCompletion(view: SequenceView): Promise<void> {
    try {
      const employee = await this.employees.getById(view.employeeId);
      if (!employee) return;
      if (view.kind === 'onboarding') {
        if (employee.employmentStatus !== 'onboarding') return;
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
      } else if (employee.employmentStatus !== 'terminated') {
        // MOB-05 (owner decision): the last step of a final exit — "Departure
        // confirmed, iqama cancelled" — ENDS the employment. Employees then
        // publishes the termination, which closes any self-service account.
        await this.employees.update(
          view.employeeId,
          { employmentStatus: 'terminated' },
          'terminate',
        );
      }
    } catch (err) {
      this.logger.error(
        `Sequence ${view.id} (${view.kind}) completed but its effect on employee ${view.employeeId} failed`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async reopen(id: string, stepKey: string): Promise<SequenceView> {
    this.actor();
    const view = await this.prisma.$transaction(async (tx) => {
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
    // After the commit (ADR-004): Billing voids the step's fee, if it recorded
    // one. A failure there is isolated by the bus and never undoes the reopen.
    await this.events.publish(
      new SequenceStepReopenedEvent(
        view.id,
        stepKey,
        view.employeeId,
        view.clientId,
        requestContext.get()?.requestId ?? null,
      ),
    );
    return view;
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
