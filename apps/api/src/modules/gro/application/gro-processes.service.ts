import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ScopedPrismaService } from '../../../prisma/scoped-prisma.service';
import type { GroProcessModel as GroProcessRecord } from '../../../generated/prisma/models';
import { Prisma, type GroProcessStatus } from '../../../generated/prisma/client';
import { auditEdit, AuditService } from '../../audit/public-api';
import { UsersService } from '../../auth/public-api';
import { requestContext } from '../../../context/request-context';
import { DependantsService, EmployeesService } from '../../employees/public-api';
import { NotificationsService } from '../../notifications/public-api';
import type { CreateGroProcessInput, UpdateGroProcessInput } from '../domain/gro-process';
import { canTransition } from '../domain/gro-status-workflow';
import {
  buildGroAssignedContent,
  buildGroStatusContent,
  expiryFieldFor,
  isDependantProcedure,
} from '../domain/gro-effects';

// GRO government-process registry access (GRO-01/02). TWO data paths, both owned
// here:
//   - STAFF path (app_staff, cross-client) via PrismaService — create/update/
//     changeStatus + list/getById.
//   - CLIENT-REP path (app_client, own-client, RLS-enforced) via ScopedPrismaService
//     — READ ONLY (*ForClient); the controller redacts to status-only. Clients never
//     write processes (the SELECT-only grant + no write endpoints enforce this).
// Every mutation writes its audit entry in the SAME transaction (AUDIT-03), scoped
// to the process's client; the snapshot is non-sensitive metadata (type/status/
// dueDate) — never gov reference numbers.
@Injectable()
export class GroProcessesService {
  private readonly logger = new Logger(GroProcessesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scoped: ScopedPrismaService,
    private readonly audit: AuditService,
    private readonly employees: EmployeesService,
    private readonly dependants: DependantsService,
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
  ) {}

  // DEP-06a: a dependant procedure names ONE current dependant of the sponsor it
  // is opened on; no other procedure names anybody. (The contract and a CHECK
  // say the same; this is where "of THIS sponsor, and not removed" is decided.)
  private async assertDependant(input: CreateGroProcessInput): Promise<void> {
    const forDependant = isDependantProcedure(input.type);
    if (forDependant !== Boolean(input.dependantId)) {
      throw new BadRequestException(
        'A dependant procedure names its dependant; no other procedure does',
      );
    }
    if (!input.dependantId) return;
    if (!(await this.dependants.findCurrent(input.employeeId, input.dependantId))) {
      throw new NotFoundException('Dependant not found');
    }
  }

  /** The dependants named by these procedures, for display (staff path only). */
  dependantNames(rows: readonly GroProcessRecord[]) {
    return this.dependants.namesOf(rows.flatMap((r) => (r.dependantId ? [r.dependantId] : [])));
  }

  // A removed dependant's open renewal has nothing left to renew (DEP-06a). Each
  // goes through changeStatus, so it is audited and its assignee is told.
  async cancelForDependant(dependantId: string): Promise<number> {
    const open = await this.prisma.groProcess.findMany({
      where: { dependantId, status: { notIn: ['completed', 'cancelled'] } },
      select: { id: true },
    });
    for (const p of open) await this.changeStatus(p.id, 'cancelled');
    return open.length;
  }

  // ASSIGN-01: a procedure goes only to someone who can work procedures — Auth's
  // shared rule (an active staff account holding gro.process). Clearing is fine.
  private async assertAssignable(userId: string | null | undefined): Promise<void> {
    if (userId && !(await this.users.isActiveStaffWith(userId, 'gro.process'))) {
      throw new BadRequestException('A procedure can only be assigned to someone who works on procedures');
    }
  }

  // Tell the new assignee (ASSIGN-01) — never when they took it themselves.
  // Category `general`, like the procedure status notifications (GRO-03).
  private async notifyAssigned(row: GroProcessRecord): Promise<void> {
    if (!row.assigneeUserId || row.assigneeUserId === requestContext.get()?.actorId) return;
    const content = buildGroAssignedContent(row.type);
    await this.notifications.notify({
      recipientUserId: row.assigneeUserId,
      category: 'general',
      title: content.title,
      body: content.body,
      data: { groProcessId: row.id, kind: 'assigned' },
    });
  }

  async create(input: CreateGroProcessInput): Promise<GroProcessRecord> {
    await this.assertAssignable(input.assigneeUserId);
    await this.assertDependant(input);
    let created: GroProcessRecord;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.groProcess.create({ data: toCreateData(input) });
        await this.audit.record(tx, {
          resource: 'gro-process',
          resourceId: row.id,
          action: 'create',
          clientId: row.clientId,
          after: snapshot(row),
        });
        return row;
      });
    } catch (err) {
      // The partial unique index: one renewal in flight per dependant.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A renewal is already open for this dependant');
      }
      throw err;
    }
    await this.notifyAssigned(created);
    return created;
  }

  list(filters?: { clientId?: string; employeeId?: string }): Promise<GroProcessRecord[]> {
    return this.prisma.groProcess.findMany({
      where: {
        ...(filters?.clientId ? { clientId: filters.clientId } : {}),
        ...(filters?.employeeId ? { employeeId: filters.employeeId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  getById(id: string): Promise<GroProcessRecord | null> {
    return this.prisma.groProcess.findUnique({ where: { id } });
  }

  // GRO-05 idempotency: has a process already been auto-spawned for this document?
  // (The DocumentExpiring event fires once per tier, so the handler must not create
  // a duplicate on each subsequent alert.)
  async existsForDocument(sourceDocumentId: string): Promise<boolean> {
    return (await this.prisma.groProcess.count({ where: { sourceDocumentId } })) > 0;
  }

  async update(id: string, data: UpdateGroProcessInput): Promise<GroProcessRecord | null> {
    await this.assertAssignable(data.assigneeUserId);
    const result = await this.prisma.$transaction(async (tx) => {
      const before = await tx.groProcess.findUnique({ where: { id } });
      if (!before) return null;
      const row = await tx.groProcess.update({ where: { id }, data: toUpdateData(data) });
      await this.audit.record(tx, {
        resource: 'gro-process',
        resourceId: row.id,
        action: 'update',
        clientId: row.clientId,
        // Every field the edit changed, old and new (ADR-022).
        ...auditEdit(before, row, snapshot),
      });
      return { before, row };
    });
    if (!result) return null;
    if (result.row.assigneeUserId !== result.before.assigneeUserId) await this.notifyAssigned(result.row);
    return result.row;
  }

  // Advance a process's status (GRO-02), staff path. Validates the transition
  // (illegal → 400), audits before/after — all in one tx. AFTER commit (GRO-03) it
  // runs the cross-module effects: notify the assignee of the change, and — on
  // completion — write the resulting government-doc expiry back to the employee's
  // govdata. Direct calls into GRO's declared dependencies (Employees, Notifications
  // — architecture module 6), NOT an event: GRO imports Employees for validation, so
  // an Employees→GRO event would cycle. Returns null if the process is missing.
  async changeStatus(id: string, to: GroProcessStatus): Promise<GroProcessRecord | null> {
    const row = await this.prisma.$transaction(async (tx) => {
      const before = await tx.groProcess.findUnique({ where: { id } });
      if (!before) return null;
      if (!canTransition(before.status, to)) {
        throw new BadRequestException(`Cannot move a GRO process from '${before.status}' to '${to}'`);
      }
      const updated = await tx.groProcess.update({ where: { id }, data: { status: to } });
      await this.audit.record(tx, {
        resource: 'gro-process',
        resourceId: updated.id,
        action: 'status',
        clientId: updated.clientId,
        before: snapshot(before),
        after: snapshot(updated),
      });
      return updated;
    });
    if (!row) return null;

    await this.applyStatusEffects(row);
    return row;
  }

  // GRO-03 cross-module effects, run after the status change commits (a failing
  // effect never rolls back the committed transition).
  private async applyStatusEffects(row: GroProcessRecord): Promise<void> {
    // Notify the assignee of the status change (in-app + email per their prefs).
    if (row.assigneeUserId) {
      const content = buildGroStatusContent(row.type, row.status);
      await this.notifications.notify({
        recipientUserId: row.assigneeUserId,
        category: 'general',
        title: content.title,
        body: content.body,
        data: { groProcessId: row.id },
      });
    }

    // On completion, write the resulting government-doc expiry back to the employee
    // (GRO operates on Employees). Only expiry-establishing types with a resulting
    // date write anything.
    if (row.status === 'completed' && row.resultingExpiry) {
      if (row.dependantId) {
        // DEP-06a: a dependant procedure renews the DEPENDANT's iqama — through
        // Employees, so it is audited against the sponsor like any other edit.
        // The dependant may have been removed since (their renewal is cancelled
        // on removal, so this is a narrow race): nothing is left to write to.
        if (await this.dependants.findCurrent(row.employeeId, row.dependantId)) {
          await this.dependants.update(row.employeeId, row.dependantId, {
            iqamaExpiry: row.resultingExpiry,
          });
        } else {
          this.logger.warn(`Procedure ${row.id} completed for a dependant no longer on file`);
        }
        return;
      }
      const field = expiryFieldFor(row.type);
      if (field) {
        await this.employees.update(row.employeeId, { [field]: row.resultingExpiry }, 'gro-completion');
      }
    }
  }

  // ---- client-representative path (own-client, RLS-enforced, READ ONLY) ----

  listForClient(clientId: string): Promise<GroProcessRecord[]> {
    return this.scoped.forClient(clientId).groProcess.findMany({ orderBy: { createdAt: 'desc' } });
  }

  // RLS filters the row to the caller's client, so a foreign id resolves to null.
  findForClient(clientId: string, id: string): Promise<GroProcessRecord | null> {
    return this.scoped.forClient(clientId).groProcess.findUnique({ where: { id } });
  }
}

function toCreateData(input: CreateGroProcessInput): Prisma.GroProcessUncheckedCreateInput {
  return {
    clientId: input.clientId,
    employeeId: input.employeeId,
    type: input.type,
    referenceNumber: input.referenceNumber ?? null,
    dueDate: input.dueDate ?? null,
    assigneeUserId: input.assigneeUserId ?? null,
    notes: input.notes ?? null,
    createdByUserId: input.createdByUserId ?? null,
    sourceDocumentId: input.sourceDocumentId ?? null,
    dependantId: input.dependantId ?? null,
  };
}

function toUpdateData(data: UpdateGroProcessInput): Prisma.GroProcessUpdateInput {
  return {
    ...(data.referenceNumber !== undefined ? { referenceNumber: data.referenceNumber } : {}),
    ...(data.dueDate !== undefined ? { dueDate: data.dueDate } : {}),
    ...(data.resultingExpiry !== undefined ? { resultingExpiry: data.resultingExpiry } : {}),
    ...(data.assigneeUserId !== undefined ? { assigneeUserId: data.assigneeUserId } : {}),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
  };
}

function snapshot(p: GroProcessRecord): Prisma.InputJsonValue {
  return {
    type: p.type,
    status: p.status,
    dueDate: p.dueDate ? p.dueDate.toISOString().slice(0, 10) : null,
    resultingExpiry: p.resultingExpiry ? p.resultingExpiry.toISOString().slice(0, 10) : null,
    assigneeUserId: p.assigneeUserId ?? null,
  };
}
