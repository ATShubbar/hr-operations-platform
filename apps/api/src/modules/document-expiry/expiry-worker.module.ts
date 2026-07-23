import { Module } from '@nestjs/common';
import { ConfigurationModule } from '../configuration/public-api';
import { ExpiryScanProcessor } from './api/expiry-scan.processor';
import { ExpirySchedulerService } from './application/expiry-scheduler.service';
import { DocumentExpiryModule } from './document-expiry.module';

// The document-expiry WORKER (EXP-02) — the daily-scan scheduler + the queue
// processor. Kept OUT of AppModule (the NOTIF producer/worker split): the BullMQ
// blocking connection and the repeatable-job registration run only where this
// module is loaded — MainModule (the real process) and the schedule e2e — never
// in ordinary specs. Uses the scan capability (DocumentExpiryModule) and the
// feature flag (ConfigurationModule → ConfigService.isEnabled).
@Module({
  imports: [DocumentExpiryModule, ConfigurationModule],
  providers: [ExpiryScanProcessor, ExpirySchedulerService],
})
export class ExpiryWorkerModule {}
