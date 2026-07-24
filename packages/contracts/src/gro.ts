import { z } from 'zod';

// GRO government processes (GRO-02; ACTION-PLAN 4.2). A government procedure for an
// employee, tracked through a status workflow. Client reps see their own processes
// STATUS-ONLY (referenceNumber/notes/assignee are redacted to null — matrix "R own,
// status only"). dueDate is a Gregorian ISO date (Hijri is a render concern).
export const groProcessTypeSchema = z.enum([
  'iqama_issue',
  'iqama_renewal',
  'exit_reentry',
  'final_exit',
  'profession_change',
  'sponsorship_transfer',
  'work_permit_renewal',
  'other',
]);
export const groProcessStatusSchema = z.enum([
  'not_started',
  'in_progress',
  'submitted',
  'approved',
  'rejected',
  'completed',
  'cancelled',
]);

export const groProcessResponseSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  employeeId: z.uuid(),
  type: groProcessTypeSchema,
  status: groProcessStatusSchema,
  referenceNumber: z.string().nullable(), // null = redacted (client-rep status-only)
  dueDate: z.string().nullable(),
  resultingExpiry: z.string().nullable(), // the new gov-doc expiry a completion writes to govdata
  assigneeUserId: z.uuid().nullable(), // null = redacted (client-rep status-only)
  notes: z.string().nullable(), // null = redacted (client-rep status-only)
  createdByUserId: z.uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Create: staff supply the `employeeId` (validated; clientId is derived from the
// employee, never taken from input). `status` is never set on create — a process
// always starts `not_started`.
export const createGroProcessRequestSchema = z.object({
  employeeId: z.uuid(),
  type: groProcessTypeSchema,
  referenceNumber: z.string().max(120).optional(),
  dueDate: z.coerce.date().optional(),
  assigneeUserId: z.uuid().optional(),
  notes: z.string().max(4000).optional(),
});

// Update: editable core fields only — status is advanced via gro.process.
export const updateGroProcessRequestSchema = z.object({
  referenceNumber: z.string().max(120).nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  resultingExpiry: z.coerce.date().nullable().optional(),
  assigneeUserId: z.uuid().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

// Status transition (gro.process): advance status, validated server-side against
// the workflow. Staff only.
export const changeGroProcessStatusRequestSchema = z.object({
  status: groProcessStatusSchema,
});

export const groProcessListResponseSchema = z.object({
  processes: z.array(groProcessResponseSchema),
});

// Staff list filter (client reps are always own-scoped).
export const groProcessQuerySchema = z.object({
  clientId: z.uuid().optional(),
  employeeId: z.uuid().optional(),
});

export type GroProcessType = z.infer<typeof groProcessTypeSchema>;
export type GroProcessStatus = z.infer<typeof groProcessStatusSchema>;
export type GroProcessResponse = z.infer<typeof groProcessResponseSchema>;
export type CreateGroProcessRequest = z.infer<typeof createGroProcessRequestSchema>;
export type UpdateGroProcessRequest = z.infer<typeof updateGroProcessRequestSchema>;
export type ChangeGroProcessStatusRequest = z.infer<typeof changeGroProcessStatusRequestSchema>;
export type GroProcessListResponse = z.infer<typeof groProcessListResponseSchema>;
export type GroProcessQuery = z.infer<typeof groProcessQuerySchema>;
