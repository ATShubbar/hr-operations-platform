import { z } from 'zod';

// Leave (ADR-014, LEAVE-02).
export const leaveTypeSchema = z.enum([
  'annual',
  'sick',
  'maternity',
  'paternity',
  'marriage',
  'bereavement',
  'hajj',
  'emergency',
  'unpaid',
]);
export const leaveStatusSchema = z.enum(['pending', 'approved', 'declined', 'withdrawn', 'filed']);

// Calendar days (ADR-014): a start date and a day count; the end is derived.
// Dates are coerced — Prisma refuses a date-only string (the DS-07 landmine).
const raiseFields = {
  type: leaveTypeSchema,
  startDate: z.coerce.date(),
  days: z.number().int().min(1).max(365),
  details: z.string().trim().max(2000).optional(),
};

// Staff and client managers say who the leave is for.
export const createLeaveRequestSchema = z.object({ employeeId: z.uuid(), ...raiseFields }).strict();

// An employee raises only for themselves: no employee id to send, and `.strict()`
// rejects one rather than dropping it (the database would refuse it anyway).
export const createSelfLeaveRequestSchema = z.object(raiseFields).strict();

export const leaveQuerySchema = z.object({
  clientId: z.uuid().optional(),
  employeeId: z.uuid().optional(),
  status: leaveStatusSchema.optional(),
});

export const leaveResponseSchema = z.object({
  id: z.uuid(),
  ref: z.string(),
  clientId: z.uuid(),
  employee: z.object({ id: z.uuid(), nameEn: z.string(), nameAr: z.string() }),
  type: leaveTypeSchema,
  startDate: z.string(), // YYYY-MM-DD
  endDate: z.string(),
  days: z.number().int(),
  details: z.string().nullable(),
  status: leaveStatusSchema,
  // Who raised it — a name and a kind, never an email (the DS-08 rule).
  raisedBy: z.object({ name: z.string().nullable(), kind: z.enum(['staff', 'client', 'employee']) }).nullable(),
  // The caller raised it — so it is theirs to withdraw while pending.
  raisedByMe: z.boolean(),
  decidedAt: z.string().nullable(),
  // An Administrator decided for the client (ADR-014).
  decidedOnBehalf: z.boolean(),
  filedAt: z.string().nullable(),
  withdrawnAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const leaveListResponseSchema = z.object({ leave: z.array(leaveResponseSchema) });

export type LeaveType = z.infer<typeof leaveTypeSchema>;
export type LeaveStatus = z.infer<typeof leaveStatusSchema>;
export type CreateLeaveRequest = z.infer<typeof createLeaveRequestSchema>;
export type CreateSelfLeaveRequest = z.infer<typeof createSelfLeaveRequestSchema>;
export type LeaveQuery = z.infer<typeof leaveQuerySchema>;
export type LeaveResponse = z.infer<typeof leaveResponseSchema>;
export type LeaveListResponse = z.infer<typeof leaveListResponseSchema>;
