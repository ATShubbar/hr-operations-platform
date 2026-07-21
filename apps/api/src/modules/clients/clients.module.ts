import { Module } from '@nestjs/common';
import { ClientsService } from './application/clients.service';

// Clients module (architecture.md Priority module; ADR-003 layout). CLIENT-01
// ships the registry table + service; HTTP endpoints and client-user
// management arrive in CLIENT-02/03.
@Module({
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
