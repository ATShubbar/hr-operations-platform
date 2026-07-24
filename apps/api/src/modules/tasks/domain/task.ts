import type { TaskPriority, TaskStatus } from '../../../generated/prisma/client';

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

// Editable fields (TASK-02). Every field optional (partial update); status is
// part of update (tasks have no separate process step, unlike requests).
export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeUserId?: string | null;
  dueDate?: Date | null;
}
