import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { AuthModule } from '../auth/public-api';
import { ClientsController } from './api/clients.controller';
import { ClientPortalUsersController } from './api/client-portal-users.controller';
import { ClientsService } from './application/clients.service';
import { ClientUsersService } from './application/client-users.service';

// Clients module (architecture.md Priority module; ADR-003 layout).
// CLIENT-01 registry + service; CLIENT-02 staff management API; client portal
// user management (drives auth's UsersService — AuthModule — and audits via
// AuditModule): CLIENT-03's client-rep path was retired in ROLE-03, leaving the
// ROLE-02 staff path.
@Module({
  imports: [AuditModule, AuthModule],
  controllers: [ClientsController, ClientPortalUsersController],
  providers: [ClientsService, ClientUsersService],
  exports: [ClientsService],
})
export class ClientsModule {}
