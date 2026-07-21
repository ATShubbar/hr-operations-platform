import { Injectable } from '@nestjs/common';
import type { AuditListResponse, AuditQuery } from '@hr/contracts';
import { PrismaService } from '../../../prisma/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';

// Audit read (AUDIT-04). Reads through the STAFF path (app_staff holds SELECT
// on aud_entries; the permissive staff RLS policy returns all clients' rows —
// audit.read is cross-client and admin-only, enforced by the guard). The
// BigInt id is serialized to a string so it survives JSON without precision
// loss (JSON has no BigInt).
@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AuditQuery): Promise<AuditListResponse> {
    const where: Prisma.AuditEntryWhereInput = {};
    if (query.resource) where.resource = query.resource;
    if (query.action) where.action = query.action;
    if (query.actorId) where.actorId = query.actorId;
    if (query.clientId) where.clientId = query.clientId;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }
    if (query.beforeId) where.id = { lt: BigInt(query.beforeId) };

    // Fetch one extra row to decide whether a next page exists.
    const rows = await this.prisma.auditEntry.findMany({
      where,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      entries: page.map((r) => ({
        id: r.id.toString(),
        actorId: r.actorId,
        actorRole: r.actorRole,
        clientId: r.clientId,
        resource: r.resource,
        action: r.action,
        before: r.before,
        after: r.after,
        requestId: r.requestId,
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? (page[page.length - 1]?.id.toString() ?? null) : null,
    };
  }
}
