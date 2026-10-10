import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { authorityOfPortal, type FeeAuthority, type FeeStatus } from '@hr/contracts';
import { requestContext } from '../../../context/request-context';
import { Prisma } from '../../../generated/prisma/client';
import type { FeeModel as FeeRecord } from '../../../generated/prisma/models';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/public-api';
import { UsersService } from '../../auth/public-api';
import { ClientsService } from '../../clients/public-api';
import { EmployeesService } from '../../employees/public-api';
import { GroProcessesService, SEQUENCES, SequencesService } from '../../gro/public-api';
import { feeSnapshot, type FeeNames } from '../domain/fee-view';

// The ledger of government fees paid on clients' behalf (BILL-01, ADR-020).
//
// Staff path only (the tables are staff-owned; the controller refuses everyone
// else). What this service owns:
//   · WHAT a fee is for decides WHOSE it is — a fee for a sequence step or a
//     procedure takes its company and person from that record (read through
//     GRO's public API; GRO never imports Billing), so a caller cannot charge
//     it to another company. A manual fee names its company, and its person
//     must work there.
//   · a step's fee needs the step FILED; one live fee per step or procedure
//     (the unique indexes are the guard — a check-then-write would race).
//   · corrections only while `recorded`; a fee is never deleted, it is VOIDED
//     with a reason; an invoiced fee is never voided.
// Every write is audited in its own transaction, against the fee.

export type FeeSourceInput =
  | { kind: 'manual'; clientId: string; employeeId?: string; label: string }
  | { kind: 'sequence_step'; sequenceId: string; stepKey: string }
  | { kind: 'procedure'; processId: string };

export interface CreateFeeInput {
  source: FeeSourceInput;
  authority?: FeeAuthority;
  amountHalalas: number;
  paidOn: Date;
}

export interface UpdateFeeInput {
  amountHalalas?: number;
  paidOn?: Date;
  authority?: FeeAuthority;
  label?: string;
}

export interface FeeFilters {
  clientId?: string;
  employeeId?: string;
  status?: FeeStatus;
  from?: Date;
  to?: Date;
}

type Resolved = Pick<
  Prisma.FeeUncheckedCreateInput,
  | 'clientId'
  | 'employeeId'
  | 'sourceKind'
  | 'sequenceId'
  | 'sequenceKind'
  | 'stepKey'
  | 'processId'
  | 'procedureType'
  | 'label'
  | 'authority'
>;

@Injectable()
export class FeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly clients: ClientsService,
    private readonly employees: EmployeesService,
    private readonly sequences: SequencesService,
    private readonly processes: GroProcessesService,
  ) {}

  list(filters: FeeFilters = {}): Promise<FeeRecord[]> {
    return this.prisma.fee.findMany({
      where: {
        ...(filters.clientId ? { clientId: filters.clientId } : {}),
        ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.from || filters.to
          ? {
              paidOn: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
      },
      // Newest payment first; the reference breaks ties so the order is stable.
      orderBy: [{ paidOn: 'desc' }, { ref: 'desc' }],
    });
  }

  getById(id: string): Promise<FeeRecord | null> {
    return this.prisma.fee.findUnique({ where: { id } });
  }

  // Names for a set of rows: the people the fees were for, and the staff who
  // recorded or voided them — display names only.
  async namesFor(rows: readonly FeeRecord[]): Promise<FeeNames> {
    const employeeIds = rows.flatMap((r) => (r.employeeId ? [r.employeeId] : []));
    const userIds = rows.flatMap((r) =>
      [r.recordedByUserId, r.voidedByUserId].filter((x): x is string => Boolean(x)),
    );
    const [employees, users] = await Promise.all([
      this.employees.namesOf(employeeIds),
      this.users.displayNames(userIds),
    ]);
    return { employees, users };
  }

  async create(input: CreateFeeInput): Promise<FeeRecord> {
    assertNotFuture(input.paidOn);
    const resolved = await this.resolve(input);
    const actorId = requestContext.get()?.actorId ?? null;
    return this.guardOnce(() =>
      this.prisma.$transaction(async (tx) => {
        const row = await tx.fee.create({
          data: {
            ...resolved,
            amountHalalas: input.amountHalalas,
            paidOn: input.paidOn,
            recordedByUserId: actorId,
          },
        });
        await this.audit.record(tx, {
          resource: 'fee',
          action: 'create',
          clientId: row.clientId,
          resourceId: row.id,
          after: feeSnapshot(row),
        });
        return row;
      }),
    );
  }

  async update(id: string, input: UpdateFeeInput): Promise<FeeRecord> {
    if (input.paidOn) assertNotFuture(input.paidOn);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.fee.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Fee not found');
      if (before.status !== 'recorded') {
        throw new ConflictException('Only a recorded fee can be corrected');
      }
      // A step's or a procedure's fee is named by its source, not by words.
      if (input.label !== undefined && before.sourceKind !== 'manual') {
        throw new BadRequestException('Only a fee recorded by hand has its own wording');
      }
      const row = await tx.fee.update({
        where: { id },
        data: {
          ...(input.amountHalalas !== undefined ? { amountHalalas: input.amountHalalas } : {}),
          ...(input.paidOn !== undefined ? { paidOn: input.paidOn } : {}),
          ...(input.authority !== undefined ? { authority: input.authority } : {}),
          ...(input.label !== undefined ? { label: input.label } : {}),
        },
      });
      await this.audit.record(tx, {
        resource: 'fee',
        action: 'update',
        clientId: row.clientId,
        resourceId: row.id,
        before: feeSnapshot(before),
        after: feeSnapshot(row),
      });
      return row;
    });
  }

  // Nothing is deleted: the fee stays in the ledger, out of every total.
  async void(id: string, reason: string): Promise<FeeRecord> {
    const actorId = requestContext.get()?.actorId ?? null;
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.fee.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Fee not found');
      if (before.status === 'void') throw new ConflictException('This fee is already void');
      if (before.status === 'invoiced') {
        throw new ConflictException('A fee that is on an invoice cannot be voided');
      }
      // Conditional on the status read above: a concurrent void or invoice
      // loses the race here rather than voiding an invoiced fee.
      const changed = await tx.fee.updateMany({
        where: { id, status: 'recorded' },
        data: { status: 'void', voidedAt: new Date(), voidedByUserId: actorId, voidReason: reason },
      });
      if (changed.count !== 1) throw new ConflictException('This fee changed in the meantime');
      const row = await tx.fee.findUniqueOrThrow({ where: { id } });
      await this.audit.record(tx, {
        resource: 'fee',
        action: 'void',
        clientId: row.clientId,
        resourceId: row.id,
        before: feeSnapshot(before),
        after: feeSnapshot(row),
      });
      return row;
    });
  }

  // What the fee is for → whose it is, and who was paid.
  private async resolve(input: CreateFeeInput): Promise<Resolved> {
    const source = input.source;
    if (source.kind === 'sequence_step') {
      const run = await this.sequences.get(source.sequenceId);
      const step = run?.steps.find((s) => s.key === source.stepKey);
      if (!run || !step) throw new NotFoundException('Sequence step not found');
      if (step.state !== 'filed') {
        throw new ConflictException('A fee is recorded once its step has been filed');
      }
      const portal = SEQUENCES[run.kind].steps.find((s) => s.key === step.key)?.portal ?? '';
      return {
        clientId: run.clientId,
        employeeId: run.employeeId,
        sourceKind: 'sequence_step',
        sequenceId: run.id,
        sequenceKind: run.kind,
        stepKey: step.key,
        authority: input.authority ?? authorityOfPortal(portal),
      };
    }
    if (source.kind === 'procedure') {
      const process = await this.processes.getById(source.processId);
      if (!process) throw new NotFoundException('Procedure not found');
      if (!input.authority) throw new BadRequestException('Say which authority was paid');
      return {
        clientId: process.clientId,
        employeeId: process.employeeId,
        sourceKind: 'procedure',
        processId: process.id,
        procedureType: process.type,
        authority: input.authority,
      };
    }
    if (!input.authority) throw new BadRequestException('Say which authority was paid');
    const client = await this.clients.getById(source.clientId);
    if (!client) throw new NotFoundException('Client not found');
    if (source.employeeId) {
      const employee = await this.employees.getById(source.employeeId);
      if (!employee || employee.clientId !== client.id) {
        throw new BadRequestException('That person does not work at this company');
      }
    }
    return {
      clientId: client.id,
      employeeId: source.employeeId ?? null,
      sourceKind: 'manual',
      label: source.label,
      authority: input.authority,
    };
  }

  // One live fee per step or procedure: the partial unique index refused it.
  private async guardOnce<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A fee is already recorded for this');
      }
      throw err;
    }
  }
}

// A fee is a payment that HAS been made. One day of slack: a date has no zone,
// and Riyadh's today begins three hours before UTC's.
function assertNotFuture(paidOn: Date): void {
  const limit = new Date();
  limit.setUTCHours(0, 0, 0, 0);
  limit.setUTCDate(limit.getUTCDate() + 1);
  if (paidOn > limit) throw new BadRequestException('A fee cannot be paid in the future');
}
