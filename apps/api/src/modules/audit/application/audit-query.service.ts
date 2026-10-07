import { Injectable } from '@nestjs/common';
import type { AuditListResponse, AuditQuery, AuditSummaryResponse } from '@hr/contracts';
import { PrismaService } from '../../../prisma/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import type { AuditEntryModel } from '../../../generated/prisma/models';
import { severityOf, whereSeverity } from '../domain/severity';

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
  /**
   * For entries keyed to a PARENT record, the sub-record they concern, read from
   * the snapshot (DEP-03: a dependant's changes are keyed to the sponsor and carry
   * `dependantId`). The snapshot itself never leaves this service.
   */
  subjectId: string | null;
}

@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  // The filters the Audit trail applies — shared by the list and the export
  // (AUDIT-07), so a file holds exactly what the screen shows.
  private whereFor(query: Omit<AuditQuery, 'limit' | 'beforeId'>): Prisma.AuditEntryWhereInput {
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
    // AUDIT-07: severity is derived from record type + action — filtered on the
    // server through the same rule table that labels each entry.
    if (query.severity) where.AND = [...((where.AND as Prisma.AuditEntryWhereInput[]) ?? []), whereSeverity(query.severity)];
    return where;
  }

  async list(query: AuditQuery): Promise<AuditListResponse> {
    const where = this.whereFor(query);
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
        severity: severityOf(r.resource, r.action),
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
    const [eventsToday, actors, critical] = await Promise.all([
      this.prisma.auditEntry.count({ where: { createdAt: { gte: since } } }),
      this.prisma.auditEntry.findMany({
        where: { actorId: { not: null } },
        distinct: ['actorId'],
        select: { actorId: true },
      }),
      // AUDIT-07: the Flagged-critical tile — critical events in the same window.
      this.prisma.auditEntry.count({ where: { AND: [{ createdAt: { gte: since } }, whereSeverity('critical')] } }),
    ]);
    return { eventsToday, actors: actors.length, critical };
  }

  /**
   * AUDIT-07: the rows an export holds — the same filters as the list, newest
   * first, at most `max` (one more is read to tell the caller it was cut).
   */
  async forExport(
    query: Omit<AuditQuery, 'limit' | 'beforeId'>,
    max: number,
  ): Promise<{ rows: AuditEntryModel[]; truncated: boolean }> {
    const rows = await this.prisma.auditEntry.findMany({
      where: this.whereFor(query),
      orderBy: { id: 'desc' },
      take: max + 1,
    });
    return { rows: rows.slice(0, max), truncated: rows.length > max };
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
        before: true,
        after: true,
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
      subjectId: dependantRef(r.after) ?? dependantRef(r.before),
    }));
  }
}

function dependantRef(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const v = (snapshot as Record<string, unknown>).dependantId;
  return typeof v === 'string' ? v : null;
}
