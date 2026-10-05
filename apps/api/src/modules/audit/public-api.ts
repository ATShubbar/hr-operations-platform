// Public surface of the audit module (ADR-003).
export { AuditModule } from './audit.module';
export { AuditService } from './application/audit.service';
export { AuditQueryService, type RecordHistoryRow } from './application/audit-query.service';
export type { AuditRecordInput } from './domain/audit-entry';
// AUDIT-07: how serious an event is — one rule table, read by the list, the export and the page.
export { severityOf, whereSeverity, type Severity } from './domain/severity';
