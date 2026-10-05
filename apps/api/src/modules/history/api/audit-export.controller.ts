import { createHash } from 'node:crypto';
import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import { auditQuerySchema } from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { toCsvDocument, type CsvCell } from '../../../csv/csv';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditQueryService, AuditService, severityOf } from '../../audit/public-api';
import { UsersService } from '../../auth/public-api';

interface ResponseHeaders {
  setHeader(name: string, value: string): void;
}

// Most rows one file holds; the page says so when the filters match more.
export const AUDIT_EXPORT_MAX = 10_000;

const HEADER = [
  'When (UTC)',
  'Severity',
  'Actor',
  'Role',
  'Record type',
  'Record id',
  'Action',
  'Client',
  'Before',
  'After',
  'Request id',
] as const;

// GET /audit/export (AUDIT-07) — the Audit trail's Export: the entries matching
// the CURRENT filters (the list's own rule — `AuditQueryService.forExport`), as
// CSV in the shared format (BOM, RFC 4180), newest first, at most 10,000 rows.
// Owner decisions: the Administrator AND the Auditor may export (`audit.export`),
// and the file carries the before/after values. Because that is a bulk copy of
// sensitive data leaving the system, the export is ITSELF audited — as Critical
// — BEFORE the bytes return (a failed audit fails the export), recording the
// filters, the row count and the file's SHA-256 so any copy can be checked
// against the log. Lives in History (a delivery module) because it names each
// actor, and Audit (a foundation module) may not import Auth.
@Controller('audit')
export class AuditExportController {
  constructor(
    private readonly auditQuery: AuditQueryService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  @RequirePermission('audit.export')
  @Get('export')
  async export(@Query() query: unknown, @Res({ passthrough: true }) res: ResponseHeaders): Promise<string> {
    const parsed = auditQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Invalid audit query');
    const { limit: _limit, beforeId: _cursor, ...filters } = parsed.data;

    const { rows, truncated } = await this.auditQuery.forExport(filters, AUDIT_EXPORT_MAX);
    const names = await this.users.displayNames(rows.map((r) => r.actorId).filter((a): a is string => !!a));
    const json = (v: unknown): CsvCell => (v === null || v === undefined ? null : JSON.stringify(v));
    const csv = toCsvDocument([
      [...HEADER],
      ...rows.map((r): CsvCell[] => [
        r.createdAt.toISOString(),
        severityOf(r.resource, r.action),
        r.actorId ? (names.get(r.actorId) ?? r.actorId) : 'system',
        r.actorRole,
        r.resource,
        r.resourceId,
        r.action,
        r.clientId,
        json(r.before),
        json(r.after),
        r.requestId,
      ]),
    ]);
    const sha256 = createHash('sha256').update(csv, 'utf8').digest('hex');

    await this.prisma.$transaction((tx) =>
      this.audit.record(tx, {
        resource: 'audit',
        action: 'export',
        after: {
          filters: Object.fromEntries(
            Object.entries(filters)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]),
          ),
          rows: rows.length,
          truncated,
          sha256,
        },
      }),
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-trail-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.setHeader('X-Export-Rows', String(rows.length));
    res.setHeader('X-Export-Truncated', String(truncated));
    return csv;
  }
}
