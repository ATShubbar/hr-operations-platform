import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { RequestsService } from './application/requests.service';

// Requests module (ACTION-PLAN 4.3; ADR-003 layout). REQ-01 ships the client-
// scoped `req_requests` registry + service (staff path). The HTTP API + the
// client-representative write path land in REQ-02; processing/SLA in REQ-03.
// AuditModule provides the transactional audit; PrismaModule is @Global.
@Module({
  imports: [AuditModule],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
