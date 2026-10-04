import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RequestAttachmentAddedEvent, RequestCommentAddedEvent } from '../../requests/public-api';
import { buildRequestAttachmentContent, buildRequestCommentContent } from '../domain/request-content';
import { NotificationsService } from './notifications.service';

// "Tell the other side" (ADR-016): a STAFF comment goes to whoever raised the
// request; a comment from the requester's side (client manager or employee) goes
// to the assignee — if nobody is assigned it waits in the work queue, as
// requests do. Never to the comment's own author. Category `request`.
// THREAD-02: a file that passed its checks is told the same way, never to its uploader.
@Injectable()
export class RequestCommentHandler {
  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(RequestCommentAddedEvent.NAME)
  async handle(event: RequestCommentAddedEvent): Promise<void> {
    const recipient = event.byStaff ? event.creatorUserId : event.assigneeUserId;
    if (!recipient || recipient === event.authorUserId) return;
    await this.tell(recipient, event.requestId, 'comment', buildRequestCommentContent({ title: event.title }));
  }

  @OnEvent(RequestAttachmentAddedEvent.NAME)
  async handleFile(event: RequestAttachmentAddedEvent): Promise<void> {
    const recipient = event.byStaff ? event.creatorUserId : event.assigneeUserId;
    if (!recipient || recipient === event.uploaderUserId) return;
    await this.tell(recipient, event.requestId, 'file', buildRequestAttachmentContent({ title: event.title }));
  }

  private async tell(
    recipientUserId: string,
    requestId: string,
    kind: 'comment' | 'file',
    content: ReturnType<typeof buildRequestCommentContent>,
  ): Promise<void> {
    await this.notifications.notify({
      recipientUserId,
      category: 'request',
      title: content.title,
      body: content.body,
      data: { requestId, kind },
    });
  }
}
