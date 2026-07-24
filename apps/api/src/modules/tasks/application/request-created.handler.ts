import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RequestCreatedEvent } from '../../requests/public-api';
import { addWorkingDays } from '../domain/working-days';
import { TasksService } from './tasks.service';

// Tasks subscribes to the request-created fact (TASK-03, ADR-004) — a client
// request spawns an internal work item. The producer (Requests) never imports
// Tasks; adding this consumer touched no request code. The task is unassigned
// (created_by/assignee null) so it lands in the admin triage queue (task.read-all),
// linked back to the request, with a 3-working-day (Sun–Thu-aware) SLA.
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
      dueDate: addWorkingDays(new Date(), 3),
    });
  }
}
