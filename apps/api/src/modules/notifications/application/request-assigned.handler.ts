import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RequestAssignedEvent } from '../../requests/public-api';
import { buildRequestAssignedContent } from '../domain/request-content';
import { NotificationsService } from './notifications.service';

// REQ-05: tell the person a request was handed to — not when they took it
// themselves. Category `request`, so their email preference applies.
@Injectable()
export class RequestAssignedHandler {
  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(RequestAssignedEvent.NAME)
  async handle(event: RequestAssignedEvent): Promise<void> {
    if (event.assigneeUserId === event.byUserId) return;
    const content = buildRequestAssignedContent({ title: event.title });
    await this.notifications.notify({
      recipientUserId: event.assigneeUserId,
      category: 'request',
      title: content.title,
      body: content.body,
      data: { requestId: event.requestId, kind: 'assigned' },
    });
  }
}
