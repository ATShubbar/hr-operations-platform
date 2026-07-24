import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { GroProcessesService } from './application/gro-processes.service';

// GRO module (ACTION-PLAN 4.2; ADR-003 layout). GRO-01 stands up the government-
// process foundation — the client-scoped gro_processes table + staff-path
// GroProcessesService (audited CRUD). GRO-02 adds the HTTP API (staff process
// workflow + client-rep read-own status-only); GRO-03 the cross-module writes to
// Employees govdata + notifications. AuditModule provides the transactional audit;
// Prisma is @Global.
@Module({
  imports: [AuditModule],
  providers: [GroProcessesService],
  exports: [GroProcessesService],
})
export class GroModule {}
