import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { LEAVE_QUEUE } from '../../queue/public-api';
import {
  CARRY_OVER_CRON,
  CARRY_OVER_JOB_NAME,
  CARRY_OVER_SCHEDULER_ID,
  CARRY_OVER_TIMEZONE,
} from '../domain/schedule';

// Registers the yearly carry-over on bootstrap (LEAVE-03), the EXP-02 pattern.
// Lives in the worker module (MainModule only), so ordinary specs never schedule it.
@Injectable()
export class LeaveCarryOverScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(LeaveCarryOverScheduler.name);

  constructor(@InjectQueue(LEAVE_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      CARRY_OVER_SCHEDULER_ID,
      { pattern: CARRY_OVER_CRON, tz: CARRY_OVER_TIMEZONE },
      { name: CARRY_OVER_JOB_NAME },
    );
    this.logger.log(`leave carry-over scheduled (${CARRY_OVER_CRON} ${CARRY_OVER_TIMEZONE})`);
  }
}
