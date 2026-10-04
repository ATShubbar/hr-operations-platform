import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmployeeScopedPrismaService } from '../../../prisma/employee-scoped-prisma.service';
import { ScopedPrismaService } from '../../../prisma/scoped-prisma.service';
import { requestContext } from '../../../context/request-context';
import type { RequestModel as RequestRecord } from '../../../generated/prisma/models';
import type { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/public-api';
import { EventBus } from '../../events/public-api';
import type {
  CreateRequestInput,
  ProcessRequestInput,
  UpdateRequestInput,
} from '../domain/request';
import { RequestCreatedEvent } from '../domain/request-created.event';
import { RequestStatusChangedEvent } from '../domain/request-status-changed.event';
import { canTransition } from '../domain/status-workflow';

// Requests registry access (REQ-01/02). TWO data paths, both owned here:
//   - STAFF path (app_staff, cross-client) via PrismaService — create/list/find/update.
//   - CLIENT-REP path (app_client, own-client, RLS-enforced) via ScopedPrismaService
//     — *ForClient methods; the transaction-local scope + RLS WITH CHECK bar any
//     cross-client read or write. The controller picks the path by principal.
// Every mutation writes its audit entry in the SAME transaction (AUDIT-03),
// scoped to the request's client (staff pass clientId; the rep path inherits it
// from the request context).
@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoped: ScopedPrismaService,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly employeeDb: EmployeeScopedPrismaService,
  ) {}

  // ---- Employee self-service path (SS-05, ADR-011) --------------------------
  // A THIRD data path: app_employee, fenced to one employee by RLS. The request
  // and its audit entry commit in ONE transaction under that scope (AUDIT-03);
  // the database's employee_raise policy refuses the insert unless it is raised
  // by THIS employee, for the company on THEIR record, with the staff triage
  // fields untouched. `employeeId` and `clientId` come from the session and the
  // employee's own record — never from request input.
  async createForEmployee(
    employeeId: string,
    clientId: string,
    input: {
      type: Prisma.RequestUncheckedCreateInput['type'];
      title: string;
      description?: string | null;
      createdByUserId: string;
    },
  ): Promise<RequestRecord> {
    const row = await this.employeeDb.transaction(employeeId, async (tx) => {
      const created = await tx.request.create({
        data: {
          clientId,
          requesterEmployeeId: employeeId,
          type: input.type,
          title: input.title,
          description: input.description ?? null,
          createdByUserId: input.createdByUserId,
          // status/priority/dueDate/assignee left to their defaults — the
          // policy requires exactly those.
        },
      });
      // clientId passed explicitly: an employee's request context carries no
      // company (it is read from the record, ADR-011 rev. 1).
      await this.audit.record(tx, {
        resource: 'request',
        resourceId: created.id,
        action: 'create',
        clientId,
        after: snapshot(created),
      });
      return created;
    });
    // Same fact as every other create — Tasks spawns its work item from it.
    await this.publishCreated(row);
    return row;
  }

  // One request THIS employee raised, or null (RLS: employee_own_read) — THREAD-01.
  findForEmployee(employeeId: string, id: string): Promise<RequestRecord | null> {
    return this.employeeDb.forEmployee(employeeId).request.findUnique({ where: { id } });
  }

  // The requests THIS employee raised (RLS: employee_own_read), newest first.
  listForEmployee(employeeId: string): Promise<RequestRecord[]> {
    return this.employeeDb.forEmployee(employeeId).request.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---- staff path (cross-client) ----

  async create(input: CreateRequestInput): Promise<RequestRecord> {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.request.create({ data: toCreateData(input) });
      await this.audit.record(tx, {
        resource: 'request',
        resourceId: created.id,
        action: 'create',
        clientId: created.clientId,
        after: snapshot(created),
      });
      return created;
    });
    await this.publishCreated(row);
    return row;
  }

  // The signature used to be `list(clientId?: string)`, which is why
  // `GET /requests?status=` was accepted and silently ignored: the query schema
  // has always declared `status`, the controller parsed it, and there was
  // nowhere to put it. Filters go in an object here, as they do on Tasks.
  list(filters?: {
    clientId?: string;
    status?: Prisma.RequestWhereInput['status'];
  }): Promise<RequestRecord[]> {
    const f = filters ?? {};
    return this.prisma.request.findMany({
      where: {
        ...(f.clientId ? { clientId: f.clientId } : {}),
        ...(f.status ? { status: f.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  listByClient(clientId: string): Promise<RequestRecord[]> {
    return this.list({ clientId });
  }

  findById(id: string): Promise<RequestRecord | null> {
    return this.prisma.request.findUnique({ where: { id } });
  }

  async update(id: string, data: UpdateRequestInput): Promise<RequestRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.request.findUnique({ where: { id } });
      if (!before) return null;
      const row = await tx.request.update({ where: { id }, data: toUpdateData(data) });
      await this.audit.record(tx, {
        resource: 'request',
        resourceId: row.id,
        action: 'update',
        clientId: row.clientId,
        before: snapshot(before),
        after: snapshot(row),
      });
      return row;
    });
  }

  // Advance a request's status (REQ-03), staff path (cross-client). Validates the
  // transition, sets/clears the assignee, audits — all in one tx — then PUBLISHES
  // RequestStatusChangedEvent so Notifications can tell the creator (the producer
  // stays decoupled from Notifications, ADR-004). Returns null if not found;
  // throws 400 on an illegal transition.
  async process(id: string, input: ProcessRequestInput): Promise<RequestRecord | null> {
    const result = await this.prisma.$transaction(async (tx) => {
      const before = await tx.request.findUnique({ where: { id } });
      if (!before) return null;
      if (!canTransition(before.status, input.status)) {
        throw new BadRequestException(
          `Cannot move a request from '${before.status}' to '${input.status}'`,
        );
      }
      const asking = input.status === 'info_needed';
      if (asking && !input.note) throw new BadRequestException('Say what is needed when asking for more detail');
      const row = await tx.request.update({
        where: { id },
        data: {
          status: input.status,
          // THREAD-03: remember where the requester's reply returns it; leaving
          // info_needed (by hand) forgets it.
          infoReturnsTo: asking ? before.status : null,
          ...(input.assigneeUserId !== undefined ? { assigneeUserId: input.assigneeUserId } : {}),
        },
      });
      await this.audit.record(tx, {
        resource: 'request',
        resourceId: row.id,
        action: asking ? 'ask-info' : 'process',
        clientId: row.clientId,
        before: snapshot(before),
        after: snapshot(row),
      });
      if (asking) {
        // The note IS the question: posted to the thread as the asker's comment,
        // in the same transaction. The status notification tells the requester
        // (one notification, not a second "new comment" one).
        const actor = requestContext.get()?.actorId;
        if (!actor) throw new BadRequestException('No signed-in user');
        const note = await tx.requestComment.create({
          data: {
            requestId: row.id,
            clientId: row.clientId,
            requesterEmployeeId: row.requesterEmployeeId,
            authorUserId: actor,
            body: input.note!.trim(),
          },
        });
        await this.audit.record(tx, {
          resource: 'request-comment',
          resourceId: note.id,
          action: 'create',
          clientId: row.clientId,
          after: { requestId: row.id, length: note.body.length },
        });
      }
      return { before, row };
    });
    if (!result) return null;

    await this.events.publish(
      new RequestStatusChangedEvent(
        result.row.id,
        result.row.clientId,
        result.row.title,
        result.before.status,
        result.row.status,
        result.row.createdByUserId,
        requestContext.get()?.requestId ?? null,
      ),
    );
    return result.row;
  }

  // ---- client-representative path (own-client, RLS-enforced) ----

  async createForClient(clientId: string, input: CreateRequestInput): Promise<RequestRecord> {
    // clientId is the caller's scoped client (from context), never input.
    const row = await this.scoped.transaction(clientId, async (tx) => {
      const created = await tx.request.create({ data: toCreateData({ ...input, clientId }) });
      await this.audit.record(tx, {
        resource: 'request',
        resourceId: created.id,
        action: 'create',
        after: snapshot(created),
      });
      return created;
    });
    await this.publishCreated(row);
    return row;
  }

  // Publish the RequestCreated fact after commit so consumers (Tasks, TASK-03)
  // never touch a request endpoint. Awaited in-process, error-isolated by the bus.
  private async publishCreated(row: RequestRecord): Promise<void> {
    await this.events.publish(
      new RequestCreatedEvent(
        row.id,
        row.clientId,
        row.type,
        row.title,
        row.createdByUserId,
        requestContext.get()?.requestId ?? null,
      ),
    );
  }

  // The rep path takes the same filter. `clientId` is deliberately NOT a filter
  // here — RLS decides which client's rows exist at all, and letting a caller
  // pass one would read as though it were selectable.
  listForClient(
    clientId: string,
    filters?: { status?: Prisma.RequestWhereInput['status'] },
  ): Promise<RequestRecord[]> {
    return this.scoped.forClient(clientId).request.findMany({
      where: filters?.status ? { status: filters.status } : {},
      orderBy: { createdAt: 'desc' },
    });
  }

  // RLS filters the row to the caller's client, so a foreign id resolves to null.
  findForClient(clientId: string, id: string): Promise<RequestRecord | null> {
    return this.scoped.forClient(clientId).request.findUnique({ where: { id } });
  }

  async updateForClient(
    clientId: string,
    id: string,
    data: UpdateRequestInput,
  ): Promise<RequestRecord | null> {
    return this.scoped.transaction(clientId, async (tx) => {
      // RLS scopes the read; a foreign id is invisible here → null → 404.
      const before = await tx.request.findUnique({ where: { id } });
      if (!before) return null;
      const row = await tx.request.update({ where: { id }, data: toUpdateData(data) });
      await this.audit.record(tx, {
        resource: 'request',
        resourceId: row.id,
        action: 'update',
        before: snapshot(before),
        after: snapshot(row),
      });
      return row;
    });
  }
}

function toCreateData(input: CreateRequestInput): Prisma.RequestUncheckedCreateInput {
  return {
    clientId: input.clientId,
    type: input.type,
    title: input.title,
    description: input.description ?? null,
    priority: input.priority ?? 'normal',
    dueDate: input.dueDate ?? null,
    createdByUserId: input.createdByUserId,
  };
}

function toUpdateData(data: UpdateRequestInput): Prisma.RequestUpdateInput {
  return {
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.priority !== undefined ? { priority: data.priority } : {}),
    ...(data.dueDate !== undefined ? { dueDate: data.dueDate } : {}),
  };
}

function snapshot(r: RequestRecord): Prisma.InputJsonValue {
  return {
    type: r.type,
    title: r.title,
    status: r.status,
    priority: r.priority,
    dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : null,
    assigneeUserId: r.assigneeUserId ?? null,
  };
}
