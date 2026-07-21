import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { ClientsController } from './api/clients.controller';
import { ClientsService } from './application/clients.service';

// Clients module (architecture.md Priority module; ADR-003 layout). CLIENT-01
// shipped the registry table + service; CLIENT-02 adds the staff management
// API (audited via AuditModule). Client-user management arrives in CLIENT-03.
@Module({
  imports: [AuditModule],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
