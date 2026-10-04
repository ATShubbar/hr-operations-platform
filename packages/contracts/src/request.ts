import { z } from 'zod';

// Requests (REQ-02; ACTION-PLAN 4.3). Client-facing workflow objects. title/
// description are user-entered free text (author's language), not system ar/en.
export const requestTypeSchema = z.enum([
  'letter',
  'certificate',
  'document',
  'gro_service',
  'general',
]);
export const requestStatusSchema = z.enum([
  'open',
  'in_progress',
  // THREAD-03 (ADR-016): waiting on the requester ("Ask for more detail").
  'info_needed',
  'resolved',
  'closed',
  'cancelled',
]);
export const requestPrioritySchema = z.enum(['low', 'normal', 'high']);

export const requestResponseSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  type: requestTypeSchema,
  title: z.string(),
  description: z.string().nullable(),
  status: requestStatusSchema,
  priority: requestPrioritySchema,
  dueDate: z.string().nullable(), // Gregorian ISO date (YYYY-MM-DD)
  // THREAD-04: the type's turnaround in working days (the current setting).
  serviceLevelDays: z.number().int().nullable(),
  createdByUserId: z.uuid(),
  // DS-08: WHO raised it, by name and kind — never their email. `name` is null
  // when the account has no display name; the whole field is null if the
  // account no longer exists.
  requester: z
    .object({
      name: z.string().nullable(),
      kind: z.enum(['staff', 'client', 'employee']),
    })
    .nullable(),
  assigneeUserId: z.uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Create: staff supply `clientId` (validated); client reps' clientId comes from
// the session and any body value is ignored. `status` is never set on create
// (a new request is always `open`).
export const createRequestRequestSchema = z.object({
  clientId: z.uuid().optional(),
  type: requestTypeSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  priority: requestPrioritySchema.optional(),
  dueDate: z.coerce.date().optional(),
});

// Update: editable fields only — status is advanced via request.process (REQ-03).
export const updateRequestRequestSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  priority: requestPrioritySchema.optional(),
  dueDate: z.coerce.date().nullable().optional(),
});

// Process (REQ-03): advance status (validated server-side against the workflow)
// and optionally set/clear the assignee. Staff only (request.process).
// THREAD-03: asking for more detail (`info_needed`) REQUIRES a note — posted to
// the thread as the asker's comment — and a note is accepted for nothing else.
export const processRequestRequestSchema = z
  .object({
    status: requestStatusSchema,
    assigneeUserId: z.uuid().nullable().optional(),
    note: z.string().trim().min(1).max(4000).optional(),
  })
  .strict()
  .refine((v) => (v.status === 'info_needed') === (v.note !== undefined), {
    message: 'A note is required when asking for more detail, and only then',
    path: ['note'],
  });

// REQ-05: hand an approved request to someone else without moving its status.
// Always a person — never "nobody".
export const assignRequestRequestSchema = z.object({ assigneeUserId: z.uuid() }).strict();

export const requestListResponseSchema = z.object({
  requests: z.array(requestResponseSchema),
});

export const requestQuerySchema = z.object({
  clientId: z.uuid().optional(),
  status: requestStatusSchema.optional(),
});

export type RequestType = z.infer<typeof requestTypeSchema>;
export type RequestStatus = z.infer<typeof requestStatusSchema>;
export type RequestPriority = z.infer<typeof requestPrioritySchema>;
export type RequestResponse = z.infer<typeof requestResponseSchema>;
export type CreateRequestRequest = z.infer<typeof createRequestRequestSchema>;
export type UpdateRequestRequest = z.infer<typeof updateRequestRequestSchema>;
export type ProcessRequestRequest = z.infer<typeof processRequestRequestSchema>;
export type RequestListResponse = z.infer<typeof requestListResponseSchema>;
export type RequestQuery = z.infer<typeof requestQuerySchema>;
