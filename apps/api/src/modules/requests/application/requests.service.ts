import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { RequestModel as RequestRecord } from '../../../generated/prisma/models';
import type { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/public-api';
import type { CreateRequestInput } from '../domain/request';

// Requests registry access (REQ-01). Staff path only here (app_staff); the
// client-representative CREATE/read path (ScopedPrismaService) lands with the
// HTTP API in REQ-02. Every mutation writes its audit entry in the same
// transaction (AUDIT-03), scoped to the request's client. A request is
// client-facing metadata (type/title/status) — the snapshot carries it in full
// (no salary/govdata-style sensitivity here).
@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  create(input: CreateRequestInput): Promise<RequestRecord> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.request.create({
        data: {
          clientId: input.clientId,
          type: input.type,
          title: input.title,
          description: input.description ?? null,
          priority: input.priority ?? 'normal',
          dueDate: input.dueDate ?? null,
          createdByUserId: input.createdByUserId,
        },
      });
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
}

function snapshot(r: RequestRecord): Prisma.InputJsonValue {
  return {
    type: r.type,
    title: r.title,
    status: r.status,
    priority: r.priority,
    dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : null,
  };
}
