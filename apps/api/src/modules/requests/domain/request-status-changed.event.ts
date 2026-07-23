import type { RequestStatus } from '../../../generated/prisma/client';
import type { DomainEvent } from '../../events/public-api';

// A request advanced to a new status (REQ-03, ADR-004). Owned by the Requests
// module (it owns the workflow); Notifications subscribes and tells the person
// who raised the request. Carries the recipient (the creator) so the consumer
// stays ignorant of who-raised-what; the notification CONTENT is the consumer's
// concern. Published once per accepted transition.
export class RequestStatusChangedEvent implements DomainEvent {
  static readonly NAME = 'request.status-changed';
  readonly name = RequestStatusChangedEvent.NAME;

  constructor(
    readonly requestId: string,
    readonly clientId: string,
    readonly title: string,
    readonly previousStatus: RequestStatus,
    readonly status: RequestStatus,
    readonly recipientUserId: string, // the request's creator
    readonly correlationId: string | null,
  ) {}
}
