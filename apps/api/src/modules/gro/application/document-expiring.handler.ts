import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DocumentExpiringEvent } from '../../document-expiry/public-api';
import { spawnTypeFor } from '../domain/gro-effects';
import { GroProcessesService } from './gro-processes.service';

// GRO subscribes to the document-expiry fact (GRO-05, ADR-004) — a document nearing
// expiry auto-opens a GRO renewal process for its employee, so the expiry becomes
// tracked government work (Notifications already consumes the same event to tell
// people; this is a second, decoupled consumer). The producer (document-expiry)
// never imports GRO; this handler imports only the event type. Clean one-way flow.
//
// Idempotency is load-bearing: the event fires ONCE PER (document, tier), so it may
// arrive up to six times per document. `existsForDocument` guarantees at most one
// process per source document.
@Injectable()
export class DocumentExpiringHandler {
  private readonly logger = new Logger(DocumentExpiringHandler.name);

  constructor(private readonly gro: GroProcessesService) {}

  @OnEvent(DocumentExpiringEvent.NAME)
  async handle(event: DocumentExpiringEvent): Promise<void> {
    // Only categories that map to a renewal procedure, and only when the document is
    // linked to an employee (a GRO process is employee-scoped).
    const type = spawnTypeFor(event.category);
    if (!type || !event.employeeId) return;

    // At most one process per source document (the event fires once per tier).
    if (await this.gro.existsForDocument(event.documentId)) return;

    await this.gro.create({
      clientId: event.clientId,
      employeeId: event.employeeId,
      type,
      dueDate: new Date(event.expiryDate),
      sourceDocumentId: event.documentId,
      notes: `Auto-opened from expiring document: ${event.title}`,
    });
    this.logger.log(`Spawned ${type} GRO process for expiring document ${event.documentId}`);
  }
}
