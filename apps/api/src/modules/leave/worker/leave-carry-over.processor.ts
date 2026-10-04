import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { LEAVE_QUEUE } from '../../queue/public-api';
import { LeaveCarryOverService } from '../application/leave-carry-over.service';
import { riyadhToday } from '../domain/leave-balance';

// Consumes the yearly job: carry into the leave year it is now in Riyadh. Not
// flag-gated — balances are wrong without it. Safe to run again (the service is
// idempotent per person per year).
@Processor(LEAVE_QUEUE)
export class LeaveCarryOverProcessor extends WorkerHost {
  constructor(private readonly carryOver: LeaveCarryOverService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    await this.carryOver.run(riyadhToday().getUTCFullYear(), null);
  }
}
