import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DISPATCH_QUEUE } from '../queue/public-api';
import { NotificationsController } from './api/notifications.controller';
import { NotificationsService } from './application/notifications.service';

// Notifications module (ACTION-PLAN 3.3; ADR-003 layout). NOTIF-02: in-app
// notifications + notify() + read/mark-read API. Registers the shared `dispatch`
// queue (NOTIF-01) as a producer so notify() can enqueue async delivery; the
// BullMQ root connection is global (QueueModule). PrismaService is global.
// NotificationsService is exported so producers (the expiry engine, 3.4) call
// notify().
@Module({
  imports: [BullModule.registerQueue({ name: DISPATCH_QUEUE })],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
