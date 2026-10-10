import { z } from 'zod';
import {
  DEFAULT_STANDARD_FEES,
  FEE_AUTHORITIES,
  FEE_STATUSES,
  MAX_FEE_HALALAS,
} from './billing-lists.js';

// Billing (ADR-020) — BILL-01: the ledger of government fees paid on clients'
// behalf. Staff only (`fee.*`); the client and employee paths have no view of it.
//
// Money is whole HALALAS (see billing-lists.ts). Write schemas are STRICT.

export const feeAuthoritySchema = z.enum(FEE_AUTHORITIES);
export const feeStatusSchema = z.enum(FEE_STATUSES);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateOnly = z
  .string()
  .regex(DATE_RE, 'Expected YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Not a real date')
  .transform((s) => new Date(`${s}T00:00:00.000Z`));

/** A fee is a positive whole number of halalas, up to SAR 1,000,000. */
export const feeAmountSchema = z.number().int().min(1).max(MAX_FEE_HALALAS);

// What a fee was FOR. A fee tied to a sequence step or a procedure takes its
// company and its person from that record — the caller cannot name another —
// and can be recorded once. A manual fee names the company itself, optionally
// a person at it, and says in words what was paid.
export const feeSourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('manual'),
    clientId: z.uuid(),
    employeeId: z.uuid().optional(),
    label: z.string().trim().min(1).max(160),
  }),
  z.strictObject({
    kind: z.literal('sequence_step'),
    sequenceId: z.uuid(),
    stepKey: z.string().min(1).max(40),
  }),
  z.strictObject({ kind: z.literal('procedure'), processId: z.uuid() }),
]);

export const createFeeRequestSchema = z.strictObject({
  source: feeSourceSchema,
  // Required for a manual fee and for a procedure; a sequence step's authority
  // is its portal unless the person paid someone else.
  authority: feeAuthoritySchema.optional(),
  amountHalalas: feeAmountSchema,
  paidOn: dateOnly,
});

// Corrections — only while the fee is `recorded` (the service enforces it).
export const updateFeeRequestSchema = z
  .strictObject({
    amountHalalas: feeAmountSchema.optional(),
    paidOn: dateOnly.optional(),
    authority: feeAuthoritySchema.optional(),
    /** A manual fee's wording only. */
    label: z.string().trim().min(1).max(160).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Provide at least one field to change',
  });

/** Nothing is deleted: a void fee stays, with who voided it and why. */
export const voidFeeRequestSchema = z.strictObject({
  reason: z.string().trim().min(3).max(300),
});

export const feeQuerySchema = z.strictObject({
  clientId: z.uuid().optional(),
  employeeId: z.uuid().optional(),
  status: feeStatusSchema.optional(),
  /** Paid on or after / on or before (YYYY-MM-DD). */
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});

export const feeResponseSchema = z.object({
  id: z.uuid(),
  ref: z.string(), // GF-0001
  clientId: z.uuid(),
  employee: z
    .object({ id: z.uuid(), name: z.object({ ar: z.string(), en: z.string() }) })
    .nullable(),
  // Keys, not sentences — the screens translate a step or a procedure type.
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('manual'), label: z.string() }),
    z.object({
      kind: z.literal('sequence_step'),
      sequenceId: z.uuid(),
      sequenceKind: z.enum(['onboarding', 'final_exit']),
      stepKey: z.string(),
    }),
    z.object({
      kind: z.literal('procedure'),
      processId: z.uuid(),
      procedureType: z.string(),
    }),
  ]),
  authority: feeAuthoritySchema,
  amountHalalas: z.number().int(),
  paidOn: z.string(), // YYYY-MM-DD
  status: feeStatusSchema,
  recordedBy: z.string().nullable(), // a display name, never an id
  recordedAt: z.string(), // ISO 8601
  voided: z.object({ at: z.string(), by: z.string().nullable(), reason: z.string() }).nullable(),
});

export const feeListResponseSchema = z.object({ fees: z.array(feeResponseSchema) });

// The standard-fee SETTING (`billing.standard-fees`, system level). Strict and
// complete: every procedure type and every step is present, so a missing key
// is a validation error and never a silent zero.
const standardAmount = z.number().int().min(0).max(MAX_FEE_HALALAS);
const exactKeys = (keys: readonly string[]) =>
  z.strictObject(Object.fromEntries(keys.map((k) => [k, standardAmount])));

export const standardFeesSchema = z.strictObject({
  procedures: exactKeys(Object.keys(DEFAULT_STANDARD_FEES.procedures)),
  steps: z.strictObject({
    onboarding: exactKeys(Object.keys(DEFAULT_STANDARD_FEES.steps.onboarding)),
    final_exit: exactKeys(Object.keys(DEFAULT_STANDARD_FEES.steps.final_exit)),
  }),
  dependantAnnual: standardAmount,
});
export const STANDARD_FEES_KEY = 'billing.standard-fees';

export type CreateFeeRequest = z.infer<typeof createFeeRequestSchema>;
export type UpdateFeeRequest = z.infer<typeof updateFeeRequestSchema>;
export type VoidFeeRequest = z.infer<typeof voidFeeRequestSchema>;
export type FeeQuery = z.infer<typeof feeQuerySchema>;
export type FeeResponse = z.infer<typeof feeResponseSchema>;
export type FeeListResponse = z.infer<typeof feeListResponseSchema>;
export type FeeSource = z.infer<typeof feeSourceSchema>;
