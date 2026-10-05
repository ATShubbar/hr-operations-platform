import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RequestCreatedEvent, RequestDueDateChangedEvent } from '../../requests/public-api';
import { TasksService } from './tasks.service';

// Tasks subscribes to the request-created fact (TASK-03, ADR-004) — a client
// request spawns an internal work item. The producer (Requests) never imports
// Tasks; adding this consumer touched no request code. The task is unassigned
// (created_by/assignee null) so it lands in the admin triage queue (task.read-all),
// linked back to the request.
//
// TASK-05: the task is due WHEN THE REQUEST IS — the request's service level in
// its company's working week (THREAD-04) — and, while the task is open, it
// FOLLOWS the request's due date whenever that moves. (It used to be a fixed
// "3 Sun–Thu working days" from a second copy of the working-day maths.)
@Injectable()
export class RequestCreatedHandler {
  constructor(private readonly tasks: TasksService) {}

  @OnEvent(RequestCreatedEvent.NAME)
  async handle(event: RequestCreatedEvent): Promise<void> {
    await this.tasks.create({
      clientId: event.clientId,
      requestId: event.requestId,
      title: `Handle request: ${event.title}`,
      createdByUserId: null,
      dueDate: event.dueDate ?? undefined,
    });
  }

  @OnEvent(RequestDueDateChangedEvent.NAME)
  async follow(event: RequestDueDateChangedEvent): Promise<void> {
    await this.tasks.followRequestDueDate(event.requestId, event.dueDate);
  }
}
