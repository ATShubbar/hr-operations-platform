// Public surface of the reporting module (ADR-003; ACTION-PLAN 5.4).
export { ReportingModule } from './reporting.module';
export { ReportingService } from './application/reporting.service';
// The catalog is the authorization contract: each report declares the
// permissions required to run it (REP-02 filters and enforces on it).
export {
  REPORT_CATALOG,
  REPORT_DEFINITIONS,
  REPORT_IDS,
  isReportId,
  type ReportCategory,
  type ReportDefinition,
  type ReportId,
} from './domain/report-catalog';
export type { ReportCell, ReportColumn, ReportResult, ReportRow } from './domain/report-result';
