import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { LeaveStatusChangedEvent } from '../../leave/public-api';
import { buildLeaveStatusContent } from '../domain/leave-content';
import { NotificationsService } from './notifications.service';

// Notifications subscribes to the leave decision fact (ADR-014, ADR-004) — the
// Leave module never calls notify(). Tells whoever raised the request; the email
// side is gated by the recipient's preference for category `leave`.
@Injectable()
export class LeaveStatusHandler {
  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(LeaveStatusChangedEvent.NAME)
  async handle(event: LeaveStatusChangedEvent): Promise<void> {
    const content = buildLeaveStatusContent(event);
    await this.notifications.notify({
      recipientUserId: event.recipientUserId,
      category: 'leave',
      title: content.title,
      body: content.body,
      data: { leaveRequestId: event.requestId, ref: event.ref, status: event.status },
    });
  }
}
