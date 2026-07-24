import { z } from 'zod';

// Tasks (TASK-02; ACTION-PLAN 4.4). Internal staff work items. title/description
// are user-entered free text. clientId/requestId are optional reporting links.
export const taskStatusSchema = z.enum(['open', 'in_progress', 'done', 'cancelled']);
export const taskPrioritySchema = z.enum(['low', 'normal', 'high']);

export const taskResponseSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid().nullable(),
  requestId: z.uuid().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  assigneeUserId: z.uuid().nullable(),
  createdByUserId: z.uuid().nullable(),
  dueDate: z.string().nullable(), // Gregorian ISO date (YYYY-MM-DD)
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createTaskRequestSchema = z.object({
  clientId: z.uuid().optional(),
  requestId: z.uuid().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  priority: taskPrioritySchema.optional(),
  assigneeUserId: z.uuid().nullable().optional(),
  dueDate: z.coerce.date().optional(),
});

export const updateTaskRequestSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigneeUserId: z.uuid().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
});

export const taskListResponseSchema = z.object({
  tasks: z.array(taskResponseSchema),
});

export const taskQuerySchema = z.object({
  clientId: z.uuid().optional(),
  status: taskStatusSchema.optional(),
  assigneeUserId: z.uuid().optional(),
});

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type TaskResponse = z.infer<typeof taskResponseSchema>;
export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;
export type UpdateTaskRequest = z.infer<typeof updateTaskRequestSchema>;
export type TaskListResponse = z.infer<typeof taskListResponseSchema>;
export type TaskQuery = z.infer<typeof taskQuerySchema>;
