import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { AuthModule } from '../auth/public-api';
import { ClientsController } from './api/clients.controller';
import { ClientUsersController } from './api/client-users.controller';
import { ClientsService } from './application/clients.service';
import { ClientUsersService } from './application/client-users.service';

// Clients module (architecture.md Priority module; ADR-003 layout).
// CLIENT-01 registry + service; CLIENT-02 staff management API; CLIENT-03
// client portal user management (drives auth's UsersService — AuthModule —
// and audits via AuditModule).
@Module({
  imports: [AuditModule, AuthModule],
  controllers: [ClientsController, ClientUsersController],
  providers: [ClientsService, ClientUsersService],
  exports: [ClientsService],
})
export class ClientsModule {}
