import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { EXPIRY_QUEUE } from '../../queue/public-api';
import { ConfigService } from '../../configuration/public-api';
import { ExpiryScanService } from '../application/expiry-scan.service';
import { DOCUMENT_EXPIRY_FLAG } from '../domain/schedule';

// The expiry-queue worker (EXP-02) — consumes the daily repeatable scan job and
// runs the scan, FLAG-GATED: the automatic run only fires when
// flag.document-expiry-alerts is on (the engine ships dormant). Lifecycle-managed
// by @nestjs/bullmq; runs only where the worker module is loaded (MainModule +
// the schedule e2e), never in ordinary specs — keeps the BullMQ blocking
// connection out of their teardown (the NOTIF producer/worker split).
@Processor(EXPIRY_QUEUE)
export class ExpiryScanProcessor extends WorkerHost {
  private readonly logger = new Logger(ExpiryScanProcessor.name);

  constructor(
    private readonly scan: ExpiryScanService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    if (!(await this.config.isEnabled(DOCUMENT_EXPIRY_FLAG))) {
      this.logger.log(`scan skipped — ${DOCUMENT_EXPIRY_FLAG} is off`);
      return;
    }
    const result = await this.scan.scan(new Date());
    this.logger.log(
      `daily scan: ${result.alertsRaised} tiers raised, ${result.notificationsSent} notifications`,
    );
  }
}
