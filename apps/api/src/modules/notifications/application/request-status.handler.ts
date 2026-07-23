import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RequestStatusChangedEvent } from '../../requests/public-api';
import { buildRequestStatusContent } from '../domain/request-content';
import { NotificationsService } from './notifications.service';

// Notifications subscribes to the request-status fact (REQ-03, ADR-004) — the
// Requests module never calls notify() directly. Tells the person who raised the
// request (the creator) that its status changed; the email side is gated by the
// recipient's NOTIF-04 preferences (category `request`).
@Injectable()
export class RequestStatusHandler {
  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(RequestStatusChangedEvent.NAME)
  async handle(event: RequestStatusChangedEvent): Promise<void> {
    const content = buildRequestStatusContent({ title: event.title, status: event.status });
    await this.notifications.notify({
      recipientUserId: event.recipientUserId,
      category: 'request',
      title: content.title,
      body: content.body,
      data: {
        requestId: event.requestId,
        status: event.status,
        previousStatus: event.previousStatus,
      },
    });
  }
}
