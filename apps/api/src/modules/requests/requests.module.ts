import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { AuthModule } from '../auth/public-api';
import { ClientsModule } from '../clients/public-api';
import { ConfigurationModule } from '../configuration/public-api';
import { RequestAttachmentsController } from './api/request-attachments.controller';
import { RequestsController } from './api/requests.controller';
import { RequestsService } from './application/requests.service';
import { RequestAttachmentsService } from './application/request-attachments.service';
import { RequestThreadService } from './application/request-thread.service';
import { ServiceLevelService } from './application/service-level.service';

// Requests module (ACTION-PLAN 4.3; ADR-003 layout). REQ-02 adds the dual-path
// HTTP API — staff (cross-client) + client reps (own-client, RLS-enforced via
// ScopedPrismaService). ClientsModule validates staff-supplied clientIds;
// AuditModule provides the transactional audit; Prisma/ScopedPrisma are @Global.
@Module({
  // AuthModule: UsersService names each request's requester (DS-08).
  // ConfigurationModule: the service-level days and working week (THREAD-04).
  imports: [AuditModule, AuthModule, ClientsModule, ConfigurationModule],
  controllers: [RequestsController, RequestAttachmentsController],
  providers: [RequestsService, RequestThreadService, RequestAttachmentsService, ServiceLevelService],
  exports: [RequestsService, RequestThreadService, RequestAttachmentsService, ServiceLevelService],
})
export class RequestsModule {}
