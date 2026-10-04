import type { DomainEvent } from '../../events/public-api';

// A request was handed to someone (REQ-05): by "Approve and assign" (process)
// or by a reassignment. Owned by Requests; Notifications tells the new
// assignee — unless they took it themselves. Published after commit.
export class RequestAssignedEvent implements DomainEvent {
  static readonly NAME = 'request.assigned';
  readonly name = RequestAssignedEvent.NAME;

  constructor(
    readonly requestId: string,
    readonly clientId: string,
    readonly title: string,
    readonly assigneeUserId: string,
    readonly byUserId: string | null,
    readonly correlationId: string | null,
  ) {}
}
