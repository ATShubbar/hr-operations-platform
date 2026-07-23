import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ScopedPrismaService } from '../../../prisma/scoped-prisma.service';
import { requestContext } from '../../../context/request-context';
import type { RequestModel as RequestRecord } from '../../../generated/prisma/models';
import type { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/public-api';
import { EventBus } from '../../events/public-api';
import type { CreateRequestInput, ProcessRequestInput, UpdateRequestInput } from '../domain/request';
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
  ) {}

  // ---- staff path (cross-client) ----

  create(input: CreateRequestInput): Promise<RequestRecord> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.request.create({ data: toCreateData(input) });
      await this.audit.record(tx, {
        resource: 'request',
        action: 'create',
        clientId: row.clientId,
        after: snapshot(row),
      });
      return row;
    });
  }

  list(clientId?: string): Promise<RequestRecord[]> {
    return this.prisma.request.findMany({
      where: clientId ? { clientId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  listByClient(clientId: string): Promise<RequestRecord[]> {
    return this.list(clientId);
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
      const row = await tx.request.update({
        where: { id },
        data: {
          status: input.status,
          ...(input.assigneeUserId !== undefined ? { assigneeUserId: input.assigneeUserId } : {}),
        },
      });
      await this.audit.record(tx, {
        resource: 'request',
        action: 'process',
        clientId: row.clientId,
        before: snapshot(before),
        after: snapshot(row),
      });
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

  createForClient(clientId: string, input: CreateRequestInput): Promise<RequestRecord> {
    // clientId is the caller's scoped client (from context), never input.
    return this.scoped.transaction(clientId, async (tx) => {
      const row = await tx.request.create({ data: toCreateData({ ...input, clientId }) });
      await this.audit.record(tx, { resource: 'request', action: 'create', after: snapshot(row) });
      return row;
    });
  }

  listForClient(clientId: string): Promise<RequestRecord[]> {
    return this.scoped.forClient(clientId).request.findMany({ orderBy: { createdAt: 'desc' } });
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
