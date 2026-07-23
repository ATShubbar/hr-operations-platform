import type { DocumentCategory } from '@hr/contracts';
import type { DomainEvent } from '../../events/public-api';

// A document has crossed an expiry threshold (NOTIF-05, ADR-004). Owned by the
// document-expiry module (it owns "what expires" and "which staff manage it");
// consumers own "how people are told". Carries the fact + the resolved audience;
// the notification CONTENT is the consumer's concern (Notifications renders it).
// Published once per (document, tier) the scan newly claims — so it inherits the
// ledger's at-most-once guarantee.
export class DocumentExpiringEvent implements DomainEvent {
  static readonly NAME = 'document.expiring';
  readonly name = DocumentExpiringEvent.NAME;

  constructor(
    readonly documentId: string,
    readonly clientId: string,
    readonly category: DocumentCategory,
    readonly title: string,
    readonly expiryDate: string, // Gregorian ISO (YYYY-MM-DD)
    readonly threshold: number, // the tier crossed (days)
    readonly daysUntil: number, // ≤ 0 means already due/expired
    readonly recipientUserIds: readonly string[],
    readonly correlationId: string | null,
  ) {}
}
