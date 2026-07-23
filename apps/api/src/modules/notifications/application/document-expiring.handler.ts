import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DocumentExpiringEvent } from '../../document-expiry/public-api';
import { buildExpiryContent } from '../domain/expiry-content';
import { NotificationsService } from './notifications.service';

// Notifications subscribes to the document-expiry fact (NOTIF-05, ADR-004) — the
// producer no longer calls notify() directly. This consumer owns "how people are
// told": it renders the bilingual content and raises one in-app notification per
// recipient (each of which enqueues its own email dispatch, NOTIF-02/03/04). The
// event is published once per (document, tier), so this inherits the scan's
// at-most-once guarantee; the handler is otherwise idempotent-safe to re-run.
@Injectable()
export class DocumentExpiringHandler {
  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(DocumentExpiringEvent.NAME)
  async handle(event: DocumentExpiringEvent): Promise<void> {
    const content = buildExpiryContent({
      category: event.category,
      title: event.title,
      expiryDate: event.expiryDate,
      days: event.daysUntil,
    });
    for (const recipientUserId of event.recipientUserIds) {
      await this.notifications.notify({
        recipientUserId,
        category: 'document_expiry',
        title: content.title,
        body: content.body,
        data: {
          documentId: event.documentId,
          category: event.category,
          threshold: event.threshold,
          expiryDate: event.expiryDate,
        },
      });
    }
  }
}
