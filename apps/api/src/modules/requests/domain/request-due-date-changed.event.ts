import type { DomainEvent } from '../../events/public-api';

// A request's due date moved (TASK-05) — a hand edit or snooze, a client
// manager's edit, or the service-level pause ending (THREAD-04). Owned by
// Requests; Tasks moves the request's OPEN task with it, so the queue never shows
// the task overdue while its request isn't. Published after commit.
export class RequestDueDateChangedEvent implements DomainEvent {
  static readonly NAME = 'request.due-date-changed';
  readonly name = RequestDueDateChangedEvent.NAME;

  constructor(
    readonly requestId: string,
    readonly dueDate: Date | null,
    readonly correlationId: string | null,
  ) {}
}
