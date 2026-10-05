// Public surface of the tasks module (ADR-003; ACTION-PLAN 4.4).
export { TasksModule } from './tasks.module';
export { TasksService } from './application/tasks.service';
export { TaskAssignedEvent } from './domain/task-assigned.event';
export type { CreateTaskInput } from './domain/task';
