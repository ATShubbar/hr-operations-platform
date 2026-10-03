// Public surface of the audit module (ADR-003).
export { AuditModule } from './audit.module';
export { AuditService } from './application/audit.service';
export { AuditQueryService, type RecordHistoryRow } from './application/audit-query.service';
export type { AuditRecordInput } from './domain/audit-entry';
