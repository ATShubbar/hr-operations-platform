import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { EmployeesModule } from '../employees/public-api';
import { LeaveService } from './application/leave.service';

// Leave module (ADR-014). LEAVE-01: the data layer — requests + the ledger, the
// three fenced data paths, audited writes. HTTP arrives in LEAVE-02. Employees
// provides the record a request is for (company, status); Prisma/Scoped/
// EmployeeScoped Prisma are @Global.
@Module({
  imports: [AuditModule, EmployeesModule],
  providers: [LeaveService],
  exports: [LeaveService],
})
export class LeaveModule {}
