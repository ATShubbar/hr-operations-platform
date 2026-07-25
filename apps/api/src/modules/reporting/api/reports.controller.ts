import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { ReportCatalogResponse, ReportDescriptor, ReportResultResponse } from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { requestContext } from '../../../context/request-context';
import { PolicyService } from '../../auth/public-api';
import { ReportingService } from '../application/reporting.service';
import {
  REPORT_CATALOG,
  REPORT_DEFINITIONS,
  isReportId,
  type ReportDefinition,
  type ReportId,
} from '../domain/report-catalog';
import { csvFileName, toCsv } from '../domain/report-csv';
import type { ReportResult } from '../domain/report-result';

// Only what this handler needs from the HTTP response — structurally typed so no
// express types leak into a controller that otherwise returns plain objects.
interface ResponseHeaders {
  setHeader(name: string, value: string): void;
}

// Reports API (REP-02) — STAFF-ONLY, read-only.
//
// TWO gates, deliberately. `report.read` (matrix: every staff role) admits a
// caller to the reporting surface at all; each report's own
// `requiredPermissions` then decides which reports that caller may list and run.
// That second check is what makes the matrix's parentheticals real — a Recruiter
// holds report.read but not salary.read, so `payroll-cost` is neither listed for
// them nor runnable, and no salary figure can be reached through this route.
//
// The catalog is FILTERED rather than annotated-and-hidden, so what a caller can
// see is exactly what they can run.
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reporting: ReportingService,
    private readonly policy: PolicyService,
  ) {}

  @RequirePermission('report.read')
  @Get()
  catalog(): ReportCatalogResponse {
    return { reports: REPORT_DEFINITIONS.filter((d) => this.canRun(d)).map(toDescriptor) };
  }

  @RequirePermission('report.read')
  @Get(':id')
  async run(@Param('id') id: string): Promise<ReportResultResponse> {
    return toResponse(await this.reporting.run(this.entitledReport(id)));
  }

  // Export (REP-03). TWO permissions on top of the data gate: `report.export` is
  // a distinct capability from reading — bulk extraction is the point at which
  // data leaves the platform's authorization boundary, so Read Only (whose whole
  // identity is passive access) reads every report it may see but exports none.
  // The report's own requiredPermissions still apply, so a Recruiter cannot
  // export payroll any more than they could read it.
  @RequirePermission('report.export')
  @Get(':id/export')
  async export(
    @Param('id') id: string,
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) res: ResponseHeaders,
  ): Promise<string> {
    const reportId = this.entitledReport(id);
    const fmt = (format ?? 'csv').toLowerCase();
    if (fmt !== 'csv') throw new BadRequestException('Unsupported export format (csv only)');

    const result = await this.reporting.run(reportId);
    // Audit BEFORE returning the bytes: if the audit write fails the export
    // fails too, so an extraction can never leave unrecorded.
    await this.reporting.recordExport(result, fmt);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${csvFileName(result)}"`);
    return toCsv(result);
  }

  // An unknown report is a 404; a known report the caller may not run is a 403 —
  // the catalog is static and documented, so its existence is not a secret, and a
  // 403 tells an operator WHY rather than pretending it is gone.
  private entitledReport(id: string): ReportId {
    if (!isReportId(id)) throw new NotFoundException('Report not found');
    const definition = REPORT_CATALOG[id];
    if (!this.canRun(definition)) {
      throw new ForbiddenException(`Report requires: ${definition.requiredPermissions.join(', ')}`);
    }
    return id;
  }

  // ALL of a report's declared permissions must be held (AND) — a report that
  // joins two sensitivity groups is only readable by someone who may read both.
  private canRun(definition: ReportDefinition): boolean {
    const role = requestContext.get()?.role;
    return definition.requiredPermissions.every((permission) => this.policy.can(role, permission));
  }
}

function toDescriptor(definition: ReportDefinition): ReportDescriptor {
  return {
    id: definition.id,
    category: definition.category,
    requiredPermissions: [...definition.requiredPermissions],
  };
}

function toResponse(result: ReportResult): ReportResultResponse {
  return {
    id: result.id,
    generatedAt: result.generatedAt,
    columns: result.columns.map((c) => ({ ...c })),
    rows: result.rows.map((r) => ({ ...r })),
    summary: { ...result.summary },
  };
}
