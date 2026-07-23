import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/public-api';
import { DocumentsModule } from '../documents/public-api';
import { NotificationsModule } from '../notifications/public-api';
import { ExpiryScanService } from './application/expiry-scan.service';

// Document-expiry engine (EXP-01; ACTION-PLAN 3.4). The scan reads documents
// (DocumentsService), resolves recipients (UsersService), and raises alerts
// (NotificationsService) — all via public surfaces. The daily SCHEDULE (a BullMQ
// repeatable job) + a manual trigger endpoint land in EXP-02; this module ships
// the scan capability on its own so it can be driven deterministically in tests.
@Module({
  imports: [AuthModule, DocumentsModule, NotificationsModule],
  providers: [ExpiryScanService],
  exports: [ExpiryScanService],
})
export class DocumentExpiryModule {}
