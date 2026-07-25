import { Controller, ForbiddenException, Get, NotFoundException, Param } from '@nestjs/common';
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
} from '../domain/report-catalog';
import type { ReportResult } from '../domain/report-result';

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
    // An unknown report is a 404; a known report the caller may not run is a
    // 403 — the catalog is static and documented, so its existence is not a
    // secret, and a 403 tells an operator WHY rather than pretending it is gone.
    if (!isReportId(id)) throw new NotFoundException('Report not found');
    const definition = REPORT_CATALOG[id];
    if (!this.canRun(definition)) {
      throw new ForbiddenException(`Report requires: ${definition.requiredPermissions.join(', ')}`);
    }
    return toResponse(await this.reporting.run(id));
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
