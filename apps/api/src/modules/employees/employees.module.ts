import { Module } from '@nestjs/common';
import { EmployeesService } from './application/employees.service';

// Employees module (architecture.md domain core; ADR-003 layout). EMP-01 ships
// the registry table + service; the HTTP API with field-level authorization
// arrives in EMP-02.
@Module({
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
