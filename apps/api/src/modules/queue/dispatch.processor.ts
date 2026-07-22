import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { DISPATCH_QUEUE } from './queue.constants';

// Dispatch worker (NOTIF-01) — the async seam for outbound delivery. For now it
// just acknowledges the job (the roundtrip proof); NOTIF-03 renders and sends
// the email here, branching on the job name/payload. Lifecycle-managed by
// @nestjs/bullmq: the underlying worker closes on module shutdown.
@Processor(DISPATCH_QUEUE)
export class DispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(DispatchProcessor.name);

  async process(job: Job): Promise<{ handled: boolean; echo: unknown }> {
    this.logger.log(`dispatch job '${job.name}' (${job.id})`);
    return { handled: true, echo: job.data };
  }
}
