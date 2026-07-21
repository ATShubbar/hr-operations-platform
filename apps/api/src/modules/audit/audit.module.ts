import { Module } from '@nestjs/common';
import { AuditService } from './application/audit.service';

// Shared module (architecture.md Shared Modules). No controllers yet — the
// admin read surface (audit.read) arrives in AUDIT-03. AUDIT-01 ships only
// the transactional write capability other modules call.
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
