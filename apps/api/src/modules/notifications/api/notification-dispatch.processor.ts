import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { DISPATCH_QUEUE } from '../../queue/public-api';
import { NotificationDispatchService } from '../application/notification-dispatch.service';

// The dispatch-queue worker (NOTIF-03) — replaces the NOTIF-01 echo. It handles
// 'notification' jobs (render + send the email); any other job type is
// acknowledged as a no-op. Lifecycle-managed by @nestjs/bullmq; runs only where
// the worker module is loaded (MainModule + the worker e2e), never in ordinary
// specs (keeps the blocking Redis connection out of their teardown).
@Processor(DISPATCH_QUEUE)
export class NotificationDispatchProcessor extends WorkerHost {
  constructor(private readonly dispatch: NotificationDispatchService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'notification') return;
    const { notificationId } = job.data as { notificationId?: string };
    if (notificationId) await this.dispatch.dispatch(notificationId);
  }
}
