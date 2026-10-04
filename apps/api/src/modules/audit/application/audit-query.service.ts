import { Injectable } from '@nestjs/common';
import type { AuditListResponse, AuditQuery, AuditSummaryResponse } from '@hr/contracts';
import { PrismaService } from '../../../prisma/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';

// Audit read (AUDIT-04). Reads through the STAFF path (app_staff holds SELECT
// on aud_entries; the permissive staff RLS policy returns all clients' rows —
// audit.read is cross-client and admin-only, enforced by the guard). The
// BigInt id is serialized to a string so it survives JSON without precision
// loss (JSON has no BigInt).
// One entry of a record's history (AUDIT-06): WHAT happened to WHICH record, by
// whom, when — and deliberately no before/after. The snapshots stay in the full
// audit log (audit.read); a record's history is readable more widely, so it
// carries only the facts that are safe to read more widely.
export interface RecordHistoryRow {
  id: string;
  resource: string;
  resourceId: string;
  action: string;
  actorId: string | null;
  actorRole: string | null;
  at: string;
}

@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AuditQuery): Promise<AuditListResponse> {
    const where: Prisma.AuditEntryWhereInput = {};
    if (query.resource) where.resource = query.resource;
    // DS-15: several record types (a category) — combined with `resource` by AND.
    if (query.resources) where.AND = [{ resource: { in: query.resources } }];
    if (query.q) {
      where.OR = [
        { action: { contains: query.q, mode: 'insensitive' } },
        { resource: { contains: query.q, mode: 'insensitive' } },
      ];
    }
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
        resourceId: r.resourceId,
        action: r.action,
        before: r.before,
        after: r.after,
        requestId: r.requestId,
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? (page[page.length - 1]?.id.toString() ?? null) : null,
    };
  }

  /**
   * DS-15: the Audit trail's header figures — entries written since `from` (the
   * start of the viewer's day; UTC midnight by default) and how many distinct
   * actors the log has ever recorded (system writes, with no actor, excluded).
   */
  async summary(from?: Date): Promise<AuditSummaryResponse> {
    const now = new Date();
    const since =
      from ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const [eventsToday, actors] = await Promise.all([
      this.prisma.auditEntry.count({ where: { createdAt: { gte: since } } }),
      this.prisma.auditEntry.findMany({
        where: { actorId: { not: null } },
        distinct: ['actorId'],
        select: { actorId: true },
      }),
    ]);
    return { eventsToday, actors: actors.length };
  }

  /**
   * AUDIT-06: the entries about a set of records, newest first. `records` pairs
   * a resource with the ids that belong to the subject (e.g. one employee's own
   * id, their documents' ids, their GRO processes' ids). Entries written before
   * AUDIT-06 have no resource_id and are never returned — none is guessed.
   */
  async forRecords(
    records: ReadonlyArray<{ resource: string; ids: readonly string[] }>,
    limit: number,
  ): Promise<RecordHistoryRow[]> {
    const or = records
      .filter((r) => r.ids.length > 0)
      .map((r) => ({ resource: r.resource, resourceId: { in: [...r.ids] } }));
    if (or.length === 0) return [];
    const rows = await this.prisma.auditEntry.findMany({
      where: { OR: or },
      orderBy: { id: 'desc' },
      take: limit,
      select: {
        id: true,
        resource: true,
        resourceId: true,
        action: true,
        actorId: true,
        actorRole: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({
      id: r.id.toString(),
      resource: r.resource,
      resourceId: r.resourceId!,
      action: r.action,
      actorId: r.actorId,
      actorRole: r.actorRole,
      at: r.createdAt.toISOString(),
    }));
  }
}
