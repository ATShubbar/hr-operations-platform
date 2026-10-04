import type { DomainEvent } from '../../events/public-api';

// A task was handed to someone (ASSIGN-01) — on creation or a reassignment.
// Owned by Tasks; Notifications tells the new assignee, unless they took it
// themselves. Published after commit.
export class TaskAssignedEvent implements DomainEvent {
  static readonly NAME = 'task.assigned';
  readonly name = TaskAssignedEvent.NAME;

  constructor(
    readonly taskId: string,
    readonly title: string,
    readonly assigneeUserId: string,
    readonly byUserId: string | null,
    readonly correlationId: string | null,
  ) {}
}
