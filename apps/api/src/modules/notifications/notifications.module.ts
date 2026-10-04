import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { DISPATCH_QUEUE } from '../queue/public-api';
import { NotificationsController } from './api/notifications.controller';
import { NotificationsService } from './application/notifications.service';
import { NotificationPreferencesService } from './application/notification-preferences.service';
import { DocumentExpiringHandler } from './application/document-expiring.handler';
import { RequestStatusHandler } from './application/request-status.handler';
import { LeaveStatusHandler } from './application/leave-status.handler';
import { AccountEmailService } from './application/account-email.service';
import { captureEmailTransportProvider } from './infra/capture-email-transport';

// Notifications module (ACTION-PLAN 3.3; ADR-003 layout). NOTIF-02: in-app
// notifications + notify() + read/mark-read API. Registers the shared `dispatch`
// queue (NOTIF-01) as a producer so notify() can enqueue async delivery; the
// BullMQ root connection is global (QueueModule). PrismaService is global.
// NotificationsService is exported so producers (the expiry engine, 3.4) call
// notify().
@Module({
  imports: [AuditModule, BullModule.registerQueue({ name: DISPATCH_QUEUE })],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationPreferencesService,
    DocumentExpiringHandler,
    RequestStatusHandler,
    LeaveStatusHandler,
    AccountEmailService,
    // ONE email transport for the process (SS-06a): the API path (account mail)
    // and the dispatch worker (notification mail) share this instance, so dev
    // capture shows everything sent and production swaps exactly one binding.
    captureEmailTransportProvider,
  ],
  exports: [
    NotificationsService,
    NotificationPreferencesService,
    AccountEmailService,
    captureEmailTransportProvider,
  ],
})
export class NotificationsModule {}
