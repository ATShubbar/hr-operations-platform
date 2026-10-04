import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmployeeScopedPrismaService } from '../../../prisma/employee-scoped-prisma.service';
import { ScopedPrismaService } from '../../../prisma/scoped-prisma.service';
import { requestContext } from '../../../context/request-context';
import type { Prisma } from '../../../generated/prisma/client';
import type { LeaveStatus, LeaveType } from '../../../generated/prisma/enums';
import type { LeaveRequestModel as LeaveRequestRecord } from '../../../generated/prisma/models';
import { AuditService } from '../../audit/public-api';
import { EmployeesService } from '../../employees/public-api';
import { LIVE_STATUSES, canMove, leaveEndDate, raiseRefusal } from '../domain/leave-rules';

export interface RaiseLeaveInput {
  employeeId: string;
  type: LeaveType;
  startDate: Date;
  days: number;
  details?: string | null;
}

export type LeaveDecision = 'approved' | 'declined';

type Tx = Prisma.TransactionClient;

// Leave requests (ADR-014, LEAVE-01). THREE data paths, the Requests pattern:
//   - STAFF (app_staff, cross-client) via PrismaService — raise, approve on the
//     client's behalf, FILE (writes the ledger), withdraw own raises.
//   - CLIENT MANAGER (app_client, own company, RLS) via ScopedPrismaService —
//     raise for own employees, approve/decline, withdraw own raises.
//   - EMPLOYEE (app_employee, one record, RLS) via EmployeeScopedPrismaService —
//     raise for themselves, withdraw what they raised.
// The database fences each path to the same moves (migration 20261004120000_leave);
// this service gives the reasons. Every write audits in the SAME transaction
// (AUDIT-03) as resource 'leave' with the request's id. A status move is a
// conditional update on the status read — if someone moved it first, the caller
// gets 409, never a silent overwrite.
@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoped: ScopedPrismaService,
    private readonly employeeDb: EmployeeScopedPrismaService,
    private readonly audit: AuditService,
    private readonly employees: EmployeesService,
  ) {}

  // ---- staff path ------------------------------------------------------------

  async raise(input: RaiseLeaveInput): Promise<LeaveRequestRecord> {
    const employee = await this.employees.getById(input.employeeId);
    if (!employee) throw new BadRequestException('Unknown employee');
    return this.prisma.$transaction(async (tx) => {
      await this.checkRaise(tx, input, employee.employmentStatus);
      const row = await tx.leaveRequest.create({
        data: this.newRow(input, employee.clientId, { raisedByUserId: actorId() }),
      });
      await this.record(tx, row, 'create', null, row.clientId);
      return row;
    });
  }

  list(filters?: {
    clientId?: string;
    employeeId?: string;
    status?: LeaveStatus;
  }): Promise<LeaveRequestRecord[]> {
    return this.prisma.leaveRequest.findMany({ where: where(filters), orderBy: ORDER });
  }

  findById(id: string): Promise<LeaveRequestRecord | null> {
    return this.prisma.leaveRequest.findUnique({ where: { id } });
  }

  // An Administrator decides for the client (ADR-014): recorded as on-behalf.
  decide(id: string, decision: LeaveDecision): Promise<LeaveRequestRecord | null> {
    return this.prisma.$transaction((tx) =>
      this.move(tx, id, 'pending', decision, {
        decidedByUserId: actorId(),
        decidedAt: new Date(),
        decidedOnBehalf: true,
      }),
    );
  }

  // PEOPLE&GRO files an approved request: the status AND its ledger entry in one
  // transaction, so a balance never sees one without the other.
  file(id: string): Promise<LeaveRequestRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const row = await this.move(tx, id, 'approved', 'filed', {
        filedByUserId: actorId(),
        filedAt: new Date(),
      });
      if (!row) return null;
      await tx.leaveEntry.create({
        data: {
          clientId: row.clientId,
          employeeId: row.employeeId,
          requestId: row.id,
          kind: 'taken',
          type: row.type,
          startDate: row.startDate,
          endDate: row.endDate,
          days: row.days,
          leaveYear: row.startDate.getUTCFullYear(),
          createdByUserId: actorId(),
        },
      });
      return row;
    });
  }

  // Staff withdraw only what THEY raised (ADR-014).
  withdraw(id: string): Promise<LeaveRequestRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.leaveRequest.findUnique({ where: { id } });
      if (!before) return null;
      assertOwnRaise(before);
      return this.move(tx, id, 'pending', 'withdrawn', { withdrawnAt: new Date() });
    });
  }

  // ---- client-manager path (own company, RLS) -----------------------------------

  async raiseForClient(clientId: string, input: RaiseLeaveInput): Promise<LeaveRequestRecord> {
    // The employee must be one of the caller's company's people; the database
    // refuses anyone else too (client_raise), this gives the reason.
    const employee = await this.employees.getById(input.employeeId);
    if (!employee || employee.clientId !== clientId) {
      throw new BadRequestException('Unknown employee');
    }
    return this.scoped.transaction(clientId, async (tx) => {
      await this.checkRaise(tx, input, employee.employmentStatus);
      const row = await tx.leaveRequest.create({
        data: this.newRow(input, clientId, { raisedByUserId: actorId() }),
      });
      await this.record(tx, row, 'create', null, clientId);
      return row;
    });
  }

  listForClient(
    clientId: string,
    filters?: { employeeId?: string; status?: LeaveStatus },
  ): Promise<LeaveRequestRecord[]> {
    // No clientId filter on this path: RLS decides which company's rows exist.
    return this.scoped
      .forClient(clientId)
      .leaveRequest.findMany({ where: where(filters), orderBy: ORDER });
  }

  findForClient(clientId: string, id: string): Promise<LeaveRequestRecord | null> {
    return this.scoped.forClient(clientId).leaveRequest.findUnique({ where: { id } });
  }

  decideForClient(
    clientId: string,
    id: string,
    decision: LeaveDecision,
  ): Promise<LeaveRequestRecord | null> {
    return this.scoped.transaction(clientId, (tx) =>
      this.move(tx, id, 'pending', decision, {
        decidedByUserId: actorId(),
        decidedAt: new Date(),
      }),
    );
  }

  withdrawForClient(clientId: string, id: string): Promise<LeaveRequestRecord | null> {
    return this.scoped.transaction(clientId, async (tx) => {
      const before = await tx.leaveRequest.findUnique({ where: { id } });
      if (!before) return null;
      assertOwnRaise(before);
      return this.move(tx, id, 'pending', 'withdrawn', { withdrawnAt: new Date() });
    });
  }

  // ---- employee path (one record, RLS) ----------------------------------------

  // `employeeId` from the SESSION and `clientId` from the employee's own record
  // — never from request input (ADR-011).
  async raiseForEmployee(
    employeeId: string,
    clientId: string,
    input: Omit<RaiseLeaveInput, 'employeeId'>,
  ): Promise<LeaveRequestRecord> {
    const self = await this.employees.getSelf(employeeId);
    if (!self) throw new ForbiddenException('No employee record');
    return this.employeeDb.transaction(employeeId, async (tx) => {
      await this.checkRaise(tx, { ...input, employeeId }, self.employmentStatus);
      const row = await tx.leaveRequest.create({
        data: this.newRow({ ...input, employeeId }, clientId, {
          raisedByUserId: actorId(),
          raisedByEmployeeId: employeeId,
        }),
      });
      // An employee context carries no company — pass it (ADR-011 rev. 1).
      await this.record(tx, row, 'create', null, clientId);
      return row;
    });
  }

  listForEmployee(employeeId: string): Promise<LeaveRequestRecord[]> {
    return this.employeeDb.forEmployee(employeeId).leaveRequest.findMany({ orderBy: ORDER });
  }

  findForEmployee(employeeId: string, id: string): Promise<LeaveRequestRecord | null> {
    return this.employeeDb.forEmployee(employeeId).leaveRequest.findUnique({ where: { id } });
  }

  withdrawForEmployee(employeeId: string, id: string): Promise<LeaveRequestRecord | null> {
    return this.employeeDb.transaction(employeeId, async (tx) => {
      const before = await tx.leaveRequest.findUnique({ where: { id } });
      if (!before) return null;
      if (before.raisedByEmployeeId !== employeeId) {
        throw new ForbiddenException('Only the person who raised a leave request can withdraw it');
      }
      return this.move(tx, id, 'pending', 'withdrawn', { withdrawnAt: new Date() });
    });
  }

  // ---- shared ------------------------------------------------------------------

  private async checkRaise(tx: Tx, input: RaiseLeaveInput, employeeStatus: string): Promise<void> {
    const hajjOnRecord =
      input.type === 'hajj' &&
      (await tx.leaveRequest.count({
        where: { employeeId: input.employeeId, type: 'hajj', status: { in: [...LIVE_STATUSES] } },
      })) > 0;
    const refusal = raiseRefusal({
      type: input.type,
      days: input.days,
      employeeStatus,
      hajjOnRecord,
    });
    if (refusal) throw new BadRequestException(refusal);
  }

  private newRow(
    input: RaiseLeaveInput,
    clientId: string,
    raisedBy: { raisedByUserId: string; raisedByEmployeeId?: string },
  ): Prisma.LeaveRequestUncheckedCreateInput {
    return {
      clientId,
      employeeId: input.employeeId,
      type: input.type,
      startDate: input.startDate,
      days: input.days,
      endDate: leaveEndDate(input.startDate, input.days),
      details: input.details ?? null,
      ...raisedBy,
    };
  }

  // Move a request from `from` to `to` iff it is still `from` — a conditional
  // update, so two people deciding at once cannot both succeed. null = not
  // found (or not visible on this path); 409 = it moved on; 400 = illegal move.
  private async move(
    tx: Tx,
    id: string,
    from: LeaveStatus,
    to: LeaveStatus,
    data: Prisma.LeaveRequestUncheckedUpdateManyInput,
  ): Promise<LeaveRequestRecord | null> {
    if (!canMove(from, to)) throw new BadRequestException(`Cannot move leave from '${from}' to '${to}'`);
    const before = await tx.leaveRequest.findUnique({ where: { id } });
    if (!before) return null;
    if (before.status !== from) {
      throw new ConflictException(`This leave request is already '${before.status}'`);
    }
    const { count } = await tx.leaveRequest.updateMany({
      where: { id, status: from },
      data: { ...data, status: to },
    });
    if (count === 0) {
      throw new ConflictException('This leave request changed while you were deciding');
    }
    const row = await tx.leaveRequest.findUniqueOrThrow({ where: { id } });
    // Every path names the request's own company: on the client-manager path
    // that is the scope itself (the aud_entries policy requires it to match).
    await this.record(tx, row, ACTION[to], before, row.clientId);
    return row;
  }

  private record(
    tx: Tx,
    row: LeaveRequestRecord,
    action: string,
    before: LeaveRequestRecord | null,
    clientId: string,
  ): Promise<void> {
    return this.audit.record(tx, {
      resource: 'leave',
      resourceId: row.id,
      action,
      clientId,
      ...(before ? { before: snapshot(before) } : {}),
      after: snapshot(row),
    });
  }
}

const ORDER = [{ createdAt: 'desc' as const }];

const ACTION: Readonly<Record<LeaveStatus, string>> = {
  pending: 'create',
  approved: 'approve',
  declined: 'decline',
  withdrawn: 'withdraw',
  filed: 'file',
};

function where(filters?: {
  clientId?: string;
  employeeId?: string;
  status?: LeaveStatus;
}): Prisma.LeaveRequestWhereInput {
  const f = filters ?? {};
  return {
    ...(f.clientId ? { clientId: f.clientId } : {}),
    ...(f.employeeId ? { employeeId: f.employeeId } : {}),
    ...(f.status ? { status: f.status } : {}),
  };
}

function actorId(): string {
  const id = requestContext.get()?.actorId;
  if (!id) throw new ForbiddenException('No signed-in user');
  return id;
}

// Staff and client managers withdraw only requests THEY raised (ADR-014); an
// employee's own raise is theirs to withdraw, not their manager's.
function assertOwnRaise(row: LeaveRequestRecord): void {
  if (row.raisedByUserId !== actorId() || row.raisedByEmployeeId !== null) {
    throw new ForbiddenException('Only the person who raised a leave request can withdraw it');
  }
}

function snapshot(r: LeaveRequestRecord): Prisma.InputJsonValue {
  return {
    ref: r.ref,
    employeeId: r.employeeId,
    type: r.type,
    startDate: r.startDate.toISOString().slice(0, 10),
    days: r.days,
    status: r.status,
    decidedOnBehalf: r.decidedOnBehalf,
  };
}
