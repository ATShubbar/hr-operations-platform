import type { DomainEvent } from '../../events/public-api';

// A comment was added to a request's thread (ADR-016, THREAD-01). Owned by
// Requests; Notifications subscribes and tells "the other side": a STAFF comment
// goes to whoever raised the request, a requester-side comment (client manager
// or the employee) to the assignee when there is one. Published after commit.
export class RequestCommentAddedEvent implements DomainEvent {
  static readonly NAME = 'request.comment-added';
  readonly name = RequestCommentAddedEvent.NAME;

  constructor(
    readonly requestId: string,
    readonly clientId: string,
    readonly title: string,
    readonly authorUserId: string,
    readonly byStaff: boolean,
    readonly creatorUserId: string,
    readonly assigneeUserId: string | null,
    readonly correlationId: string | null,
  ) {}
}
