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

// ---- Balances (LEAVE-03) --------------------------------------------------------
// Annual leave for the current leave year (1 Jan – 31 Dec). `available` is signed:
// below zero = overdrawn, the excess unpaid (ADR-014).
export const leaveBalanceSchema = z.object({
  year: z.number().int(),
  entitlement: z.number().int(),
  accrued: z.number().int(),
  carried: z.number().int(),
  taken: z.number().int(),
  booked: z.number().int(),
  pending: z.number().int(),
  available: z.number().int(),
  overdrawn: z.boolean(),
  sick: z.number().int(),
  unpaid: z.number().int(),
});

const balanceEmployeeSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  nameEn: z.string(),
  nameAr: z.string(),
  hireDate: z.string().nullable(),
});

export const leaveBalanceListResponseSchema = z.object({
  // The day the figures are as of — Riyadh's calendar day.
  today: z.string(),
  balances: z.array(z.object({ employee: balanceEmployeeSchema, balance: leaveBalanceSchema })),
});

// One filed spell of leave (a ledger entry). A spell crossing 31 December is two
// entries, one per year (owner decision).
export const leaveHistoryEntrySchema = z.object({
  ref: z.string().nullable(),
  type: leaveTypeSchema,
  startDate: z.string(),
  endDate: z.string(),
  days: z.number().int(),
  leaveYear: z.number().int(),
  // Ended on or before today, or still to come.
  state: z.enum(['taken', 'booked']),
});

export const employeeLeaveResponseSchema = z.object({
  today: z.string(),
  employee: balanceEmployeeSchema,
  balance: leaveBalanceSchema,
  history: z.array(leaveHistoryEntrySchema),
});

// `clientId` limits a manual run to one company; omitted = everyone (the job).
export const carryOverRequestSchema = z
  .object({ year: z.number().int().min(2000).max(2100), clientId: z.uuid().optional() })
  .strict();
export const carryOverResponseSchema = z.object({
  year: z.number().int(),
  credited: z.number().int(),
  alreadyCredited: z.number().int(),
  nothingToCarry: z.number().int(),
});

export type LeaveBalance = z.infer<typeof leaveBalanceSchema>;
export type LeaveBalanceListResponse = z.infer<typeof leaveBalanceListResponseSchema>;
export type LeaveHistoryEntry = z.infer<typeof leaveHistoryEntrySchema>;
export type EmployeeLeaveResponse = z.infer<typeof employeeLeaveResponseSchema>;
export type CarryOverRequest = z.infer<typeof carryOverRequestSchema>;
export type CarryOverResponse = z.infer<typeof carryOverResponseSchema>;
