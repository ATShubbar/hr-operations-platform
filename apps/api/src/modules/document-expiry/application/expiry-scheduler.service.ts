import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { EXPIRY_QUEUE } from '../../queue/public-api';
import {
  DAILY_SCAN_CRON,
  DAILY_SCAN_SCHEDULER_ID,
  SCAN_JOB_NAME,
  SCAN_TIMEZONE,
} from '../domain/schedule';

// Registers the daily expiry-scan on application bootstrap (EXP-02). Upserted by
// a fixed scheduler id, so restarts never duplicate it. Lives in the worker
// module (MainModule only) so ordinary specs — which import AppModule alone —
// never schedule a stray repeatable job. The processor consumes each occurrence.
@Injectable()
export class ExpirySchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExpirySchedulerService.name);

  constructor(@InjectQueue(EXPIRY_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      DAILY_SCAN_SCHEDULER_ID,
      { pattern: DAILY_SCAN_CRON, tz: SCAN_TIMEZONE },
      { name: SCAN_JOB_NAME },
    );
    this.logger.log(`daily expiry scan scheduled (${DAILY_SCAN_CRON} ${SCAN_TIMEZONE})`);
  }
}
