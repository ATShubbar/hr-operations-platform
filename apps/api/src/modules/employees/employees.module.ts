import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { AuthModule } from '../auth/public-api';
import { ClientsModule } from '../clients/public-api';
import { EmployeesController } from './api/employees.controller';
import { CandidateHiredHandler } from './application/candidate-hired.handler';
import { EmployeesService } from './application/employees.service';

// Employees module (architecture.md domain core; ADR-003 layout). EMP-01
// registry + service; EMP-02 the HTTP API with field-level authorization
// (audited via AuditModule; validates client_id via ClientsModule; reads the
// caller's capabilities via AuthModule's PolicyService). REC-05: CandidateHiredHandler
// subscribes to Recruitment's candidate.hired event and creates the employee
// record (ADR-004) — the event bus is @Global, so no RecruitmentModule import.
@Module({
  imports: [AuditModule, AuthModule, ClientsModule],
  controllers: [EmployeesController],
  providers: [EmployeesService, CandidateHiredHandler],
  exports: [EmployeesService],
})
export class EmployeesModule {}
