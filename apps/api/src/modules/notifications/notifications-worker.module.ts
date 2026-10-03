import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/public-api';
import { ConfigurationModule } from '../configuration/public-api';
import { NotificationsModule } from './notifications.module';
import { NotificationDispatchProcessor } from './api/notification-dispatch.processor';
import { NotificationDispatchService } from './application/notification-dispatch.service';

// The notification delivery WORKER (NOTIF-03) — the dispatch-queue consumer +
// email transport + templates. Kept OUT of AppModule (like the NOTIF-01 worker
// split) so the BullMQ blocking connection runs only in MainModule and the
// worker e2e, not in every spec's teardown. Uses auth (recipient email) and
// config (recipient language). Binds the dev capture transport to EMAIL_TRANSPORT
// (production swaps in a real SMTP transport).
@Module({
  imports: [AuthModule, ConfigurationModule, NotificationsModule],
  // The email transport now comes from NotificationsModule (one instance per
  // process, shared with account mail — SS-06a); re-exported for the queue e2e.
  providers: [NotificationDispatchService, NotificationDispatchProcessor],
  exports: [NotificationsModule],
})
export class NotificationsWorkerModule {}
