import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { EmployeesModule } from '../employees/public-api';
import { NotificationsModule } from '../notifications/public-api';
import { GroProcessesController } from './api/gro-processes.controller';
import { GroProcessesService } from './application/gro-processes.service';

// GRO module (ACTION-PLAN 4.2; ADR-003 layout). Staff CRUD + the gro.process status
// workflow + client-rep read-own (RLS, status-only). GRO "operates on" Employees +
// Notifications (architecture module 6) — a one-way dependency (neither imports GRO,
// so no cycle): EmployeesModule validates the subject employee (and GRO-03 writes the
// completed process's resulting expiry back to its govdata); NotificationsModule
// raises the status-change notification. AuditModule provides the transactional
// audit; Prisma/ScopedPrisma are @Global.
@Module({
  imports: [AuditModule, EmployeesModule, NotificationsModule],
  controllers: [GroProcessesController],
  providers: [GroProcessesService],
  exports: [GroProcessesService],
})
export class GroModule {}
