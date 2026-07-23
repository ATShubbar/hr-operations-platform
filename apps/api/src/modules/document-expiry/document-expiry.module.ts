import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/public-api';
import { DocumentsModule } from '../documents/public-api';
import { ExpiryController } from './api/expiry.controller';
import { ExpiryScanService } from './application/expiry-scan.service';

// Document-expiry engine (EXP-01; ACTION-PLAN 3.4). The scan reads documents
// (DocumentsService), resolves recipients (UsersService), and PUBLISHES a
// DocumentExpiring fact on the event bus (NOTIF-05, ADR-004) — it no longer
// depends on Notifications (which subscribes). EventBus comes from the @Global
// EventsModule. The manual trigger endpoint (EXP-02, POST /expiry/scan) lives
// here in AppModule; the daily SCHEDULE + its worker live in ExpiryWorkerModule
// (MainModule only, producer/worker split).
@Module({
  imports: [AuthModule, DocumentsModule],
  controllers: [ExpiryController],
  providers: [ExpiryScanService],
  exports: [ExpiryScanService],
})
export class DocumentExpiryModule {}
