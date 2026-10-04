import type { DomainEvent } from '../../events/public-api';

// A file on a request's thread passed its checks and became available
// (ADR-016, THREAD-02). Owned by Requests; Notifications tells "the other side"
// exactly as for a comment: a STAFF upload goes to whoever raised the request, a
// requester-side upload (client manager or the employee) to the assignee when
// there is one. Published after commit, never for a file the check refused.
export class RequestAttachmentAddedEvent implements DomainEvent {
  static readonly NAME = 'request.attachment-added';
  readonly name = RequestAttachmentAddedEvent.NAME;

  constructor(
    readonly requestId: string,
    readonly clientId: string,
    readonly title: string,
    readonly uploaderUserId: string,
    readonly byStaff: boolean,
    readonly creatorUserId: string,
    readonly assigneeUserId: string | null,
    readonly correlationId: string | null,
  ) {}
}
