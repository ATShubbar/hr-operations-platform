import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { AuthModule } from '../auth/public-api';
import { ClientsModule } from '../clients/public-api';
import { EmployeesController } from './api/employees.controller';
import { EmployeesService } from './application/employees.service';

// Employees module (architecture.md domain core; ADR-003 layout). EMP-01
// registry + service; EMP-02 the HTTP API with field-level authorization
// (audited via AuditModule; validates client_id via ClientsModule; reads the
// caller's capabilities via AuthModule's PolicyService).
@Module({
  imports: [AuditModule, AuthModule, ClientsModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
