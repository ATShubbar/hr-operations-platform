import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/public-api';
import { DocumentsModule } from '../documents/public-api';
import { NotificationsModule } from '../notifications/public-api';
import { ExpiryController } from './api/expiry.controller';
import { ExpiryScanService } from './application/expiry-scan.service';

// Document-expiry engine (EXP-01; ACTION-PLAN 3.4). The scan reads documents
// (DocumentsService), resolves recipients (UsersService), and raises alerts
// (NotificationsService) — all via public surfaces. The manual trigger endpoint
// (EXP-02, POST /expiry/scan) lives here in AppModule; the daily SCHEDULE + its
// worker live in ExpiryWorkerModule (MainModule only, producer/worker split).
@Module({
  imports: [AuthModule, DocumentsModule, NotificationsModule],
  controllers: [ExpiryController],
  providers: [ExpiryScanService],
  exports: [ExpiryScanService],
})
export class DocumentExpiryModule {}
