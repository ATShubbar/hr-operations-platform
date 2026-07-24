import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { EmployeesModule } from '../employees/public-api';
import { GroProcessesController } from './api/gro-processes.controller';
import { GroProcessesService } from './application/gro-processes.service';

// GRO module (ACTION-PLAN 4.2; ADR-003 layout). GRO-02 adds the HTTP API — staff
// CRUD + the gro.process status workflow, plus the client-rep read-own path
// (RLS-enforced, status-only redaction). EmployeesModule validates the subject
// employee on create (and derives its clientId — GRO operates on Employees, one-way,
// no cycle). AuditModule provides the transactional audit; Prisma/ScopedPrisma are
// @Global. GRO-03 adds the cross-module writes to Employees govdata + notifications.
@Module({
  imports: [AuditModule, EmployeesModule],
  controllers: [GroProcessesController],
  providers: [GroProcessesService],
  exports: [GroProcessesService],
})
export class GroModule {}
