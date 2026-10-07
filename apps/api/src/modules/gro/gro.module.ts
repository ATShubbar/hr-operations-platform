import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { AuthModule } from '../auth/public-api';
import { EmployeesModule } from '../employees/public-api';
import { NotificationsModule } from '../notifications/public-api';
import { GroProcessesController } from './api/gro-processes.controller';
import { SequencesController } from './api/sequences.controller';
import { DocumentExpiringHandler } from './application/document-expiring.handler';
import { GroProcessesService } from './application/gro-processes.service';
import { SequencesService } from './application/sequences.service';

// GRO module (ACTION-PLAN 4.2; ADR-003 layout). Staff CRUD + the gro.process status
// workflow + client-rep read-own (RLS, status-only). GRO "operates on" Employees +
// Notifications (architecture module 6) — a one-way dependency (neither imports GRO,
// so no cycle): EmployeesModule validates the subject employee (and GRO-03 writes the
// completed process's resulting expiry back to its govdata); NotificationsModule
// raises the status-change notification. AuditModule provides the transactional
// audit; Prisma/ScopedPrisma are @Global. GRO-05: DocumentExpiringHandler subscribes
// to the document-expiry engine's event and auto-spawns a renewal process (5th
// ADR-004 flow) — one-way (GRO imports only the event type; the bus is @Global).
// MOB-01 (ADR-018): SequencesService — onboarding and final-exit sequences.
@Module({
  imports: [AuditModule, AuthModule, EmployeesModule, NotificationsModule],
  controllers: [GroProcessesController, SequencesController],
  providers: [GroProcessesService, SequencesService, DocumentExpiringHandler],
  exports: [GroProcessesService, SequencesService],
})
export class GroModule {}
