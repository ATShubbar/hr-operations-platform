import { Module } from '@nestjs/common';
import { AuditController } from './api/audit.controller';
import { AuditService } from './application/audit.service';
import { AuditQueryService } from './application/audit-query.service';

// Shared module (architecture.md Shared Modules). Exposes the transactional
// write capability other modules call (AuditService) and the admin-only read
// surface (AuditController, audit.read — AUDIT-04). AuditQueryService is
// module-internal; only AuditService is exported to other modules.
@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditQueryService],
  exports: [AuditService],
})
export class AuditModule {}
