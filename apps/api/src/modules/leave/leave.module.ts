import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { AuthModule } from '../auth/public-api';
import { EmployeesModule } from '../employees/public-api';
import { LeaveController } from './api/leave.controller';
import { LeavePresenter } from './application/leave-presenter';
import { LeaveService } from './application/leave.service';

// Leave module (ADR-014). LEAVE-01: the data layer — requests + the ledger, the
// three fenced data paths, audited writes. LEAVE-02: the dual-path HTTP API
// (/leave) and the presenter /me/leave reuses. Employees provides the record a
// request is for; Auth names who raised it. Prisma/Scoped/EmployeeScoped Prisma
// are @Global.
@Module({
  imports: [AuditModule, AuthModule, EmployeesModule],
  controllers: [LeaveController],
  providers: [LeaveService, LeavePresenter],
  exports: [LeaveService, LeavePresenter],
})
export class LeaveModule {}
