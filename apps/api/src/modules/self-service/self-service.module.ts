import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { AuthModule } from '../auth/public-api';
import { ClientsModule } from '../clients/public-api';
import { ConfigurationModule } from '../configuration/public-api';
import { DocumentsModule } from '../documents/public-api';
import { EmployeesModule } from '../employees/public-api';
import { EscalationsModule } from '../escalations/public-api';
import { LeaveModule } from '../leave/public-api';
import { NotificationsModule } from '../notifications/public-api';
import { RequestsModule } from '../requests/public-api';
import { StorageModule } from '../storage/public-api';
import { EmployeeAccountsController } from './api/employee-accounts.controller';
import { PasswordResetController } from './api/password-reset.controller';
import { SelfServiceController } from './api/self-service.controller';
import { EmployeeAccountsService } from './application/employee-accounts.service';
import { EmployeeTerminatedHandler } from './application/employee-terminated.handler';

// Employee self-service — "Me" (ADR-011; architecture.md module 11). A DELIVERY
// module, the counterpart of the Client Portal: no business logic of its own,
// reads Employees / Documents / Storage / Requests / Clients / Configuration
// through their public APIs, and
// nothing imports it — it sits at the top of the module graph, so no cycle forms.
@Module({
  imports: [
    AuditModule,
    AuthModule,
    ClientsModule,
    ConfigurationModule,
    EmployeesModule,
    DocumentsModule,
    StorageModule,
    RequestsModule,
    LeaveModule,
    // NC-05 (ADR-021 rev. 2): the employee's own ladder is served here, behind
    // the same gate as the rest of /me. Escalations imports only domain
    // modules, so this edge closes no loop.
    EscalationsModule,
    NotificationsModule,
  ],
  controllers: [SelfServiceController, EmployeeAccountsController, PasswordResetController],
  providers: [EmployeeAccountsService, EmployeeTerminatedHandler],
})
export class SelfServiceModule {}
