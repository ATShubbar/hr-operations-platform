import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/public-api';
import { ClientsModule } from '../clients/public-api';
import { ConfigurationModule } from '../configuration/public-api';
import { EmployeesModule } from '../employees/public-api';
import { GroModule } from '../gro/public-api';
import { RequestsModule } from '../requests/public-api';
import { TasksModule } from '../tasks/public-api';
import { EscalationsController } from './api/escalations.controller';
import { EscalationsService } from './application/escalations.service';

// Escalations (ADR-021, architecture module 16) — the notification centre's
// ladder. A DELIVERY module at the top of the graph, like Search and
// Reporting: it reads the domain modules' public APIs and nothing imports it,
// (bar Self-Service, itself a delivery module, for the `/me` routes), so no
// cycle can form. (It could not live in Notifications: GRO and
// Self-Service import Notifications, so Notifications reading GRO or
// Employees would close a loop.) NC-01 owns no data; the read marks arrive
// with NC-02.
@Module({
  imports: [
    AuthModule,
    ClientsModule,
    ConfigurationModule,
    EmployeesModule,
    GroModule,
    RequestsModule,
    TasksModule,
  ],
  controllers: [EscalationsController],
  providers: [EscalationsService],
  // NC-05: Self-Service serves the employee's ladder under `/me` (its gate —
  // the session's record, the company's switch — lives there).
  exports: [EscalationsService],
})
export class EscalationsModule {}
