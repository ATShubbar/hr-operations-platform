import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { ClientsModule } from '../clients/public-api';
import { RequestsController } from './api/requests.controller';
import { RequestsService } from './application/requests.service';

// Requests module (ACTION-PLAN 4.3; ADR-003 layout). REQ-02 adds the dual-path
// HTTP API — staff (cross-client) + client reps (own-client, RLS-enforced via
// ScopedPrismaService). ClientsModule validates staff-supplied clientIds;
// AuditModule provides the transactional audit; Prisma/ScopedPrisma are @Global.
@Module({
  imports: [AuditModule, ClientsModule],
  controllers: [RequestsController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
