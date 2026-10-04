import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TaskAssignedEvent } from '../../tasks/public-api';
import { buildTaskAssignedContent } from '../domain/task-content';
import { NotificationsService } from './notifications.service';

// ASSIGN-01: tell the person a task was handed to — not when they took it
// themselves. Category `task`, so their email preference applies.
@Injectable()
export class TaskAssignedHandler {
  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(TaskAssignedEvent.NAME)
  async handle(event: TaskAssignedEvent): Promise<void> {
    if (event.assigneeUserId === event.byUserId) return;
    const content = buildTaskAssignedContent({ title: event.title });
    await this.notifications.notify({
      recipientUserId: event.assigneeUserId,
      category: 'task',
      title: content.title,
      body: content.body,
      data: { taskId: event.taskId, kind: 'assigned' },
    });
  }
}
