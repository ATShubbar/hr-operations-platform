import type { RequestType } from '../../../generated/prisma/client';
import type { DomainEvent } from '../../events/public-api';

// A client request was created (TASK-03, ADR-004). Owned by the Requests module;
// the Tasks module subscribes and spawns an internal work item to handle it. The
// producer stays ignorant of Tasks — adding this consumer never touched a request
// endpoint. Published once per request created (staff or client-rep path).
export class RequestCreatedEvent implements DomainEvent {
  static readonly NAME = 'request.created';
  readonly name = RequestCreatedEvent.NAME;

  constructor(
    readonly requestId: string,
    readonly clientId: string,
    readonly type: RequestType,
    readonly title: string,
    readonly createdByUserId: string,
    readonly correlationId: string | null,
  ) {}
}
