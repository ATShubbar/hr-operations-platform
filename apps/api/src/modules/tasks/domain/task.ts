import type { TaskPriority } from '../../../generated/prisma/client';

// Input to TasksService.create (TASK-01). A new task always starts `open`.
// clientId/requestId are optional reporting links; createdByUserId/assigneeUserId
// are nullable so a system-spawned task (TASK-03) can be unassigned.
export interface CreateTaskInput {
  clientId?: string | null;
  requestId?: string | null;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  assigneeUserId?: string | null;
  createdByUserId?: string | null;
  dueDate?: Date | null;
}
