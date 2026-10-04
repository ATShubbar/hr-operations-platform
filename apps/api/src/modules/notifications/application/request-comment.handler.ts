import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RequestCommentAddedEvent } from '../../requests/public-api';
import { buildRequestCommentContent } from '../domain/request-content';
import { NotificationsService } from './notifications.service';

// "Tell the other side" (ADR-016): a STAFF comment goes to whoever raised the
// request; a comment from the requester's side (client manager or employee) goes
// to the assignee — if nobody is assigned it waits in the work queue, as
// requests do. Never to the comment's own author. Category `request`.
@Injectable()
export class RequestCommentHandler {
  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(RequestCommentAddedEvent.NAME)
  async handle(event: RequestCommentAddedEvent): Promise<void> {
    const recipient = event.byStaff ? event.creatorUserId : event.assigneeUserId;
    if (!recipient || recipient === event.authorUserId) return;
    const content = buildRequestCommentContent({ title: event.title });
    await this.notifications.notify({
      recipientUserId: recipient,
      category: 'request',
      title: content.title,
      body: content.body,
      data: { requestId: event.requestId, kind: 'comment' },
    });
  }
}
