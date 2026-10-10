import { z } from 'zod';
import {
  BILLING_CYCLES,
  DEFAULT_STANDARD_FEES,
  FEE_AUTHORITIES,
  FEE_RECEIPT_MAX_BYTES,
  FEE_RECEIPT_STATUSES,
  FEE_RECEIPT_TYPES,
  ACCOUNT_STANDINGS,
  FEE_STATUSES,
  INVOICE_STATUSES,
  MAX_FEE_HALALAS,
  MAX_INVOICE_FEES,
  MAX_INVOICE_HALALAS,
  MAX_TERM_HALALAS,
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
  // BILL-02: the one receipt, if any. Only an `available` one can be opened.
  receipt: z.object({ fileName: z.string(), status: z.enum(FEE_RECEIPT_STATUSES) }).nullable(),
  recordedBy: z.string().nullable(), // a display name, never an id
  recordedAt: z.string(), // ISO 8601
  voided: z.object({ at: z.string(), by: z.string().nullable(), reason: z.string() }).nullable(),
});

export const feeListResponseSchema = z.object({ fees: z.array(feeResponseSchema) });

// A receipt (BILL-02): declare the file, PUT it straight to storage with the
// returned URL, then confirm — the server checks what actually arrived.
export const feeReceiptUploadRequestSchema = z.strictObject({
  fileName: z.string().trim().min(1).max(200),
  contentType: z.enum(FEE_RECEIPT_TYPES),
  sizeBytes: z.number().int().min(1).max(FEE_RECEIPT_MAX_BYTES),
});
export const feeReceiptUploadResponseSchema = z.object({
  fee: feeResponseSchema,
  upload: z.object({
    url: z.string(),
    method: z.literal('PUT'),
    headers: z.record(z.string(), z.string()),
    expiresInSeconds: z.number().int(),
  }),
});
export const feeReceiptDownloadResponseSchema = z.object({
  url: z.string(),
  expiresInSeconds: z.number().int(),
});

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

// ---------------------------------------------------------------------------
// Commercial terms and the estimate (BILL-04). Administrator only
// (`billing.*`); the Auditor reads. The whole set is sent on every save —
// there is one row of terms per client and no half-written state.
// ---------------------------------------------------------------------------

export const billingCycleSchema = z.enum(BILLING_CYCLES);
const termAmount = z.number().int().min(0).max(MAX_TERM_HALALAS);

export const billingTermsSchema = z.strictObject({
  platformFeeHalalas: termAmount, // per month
  seatRateHalalas: termAmount, // per employee under management, per month
  cycle: billingCycleSchema,
  poNumber: z.string().trim().min(1).max(60).nullable(),
  paymentTermsDays: z.number().int().min(0).max(365),
});

export const billingSummaryResponseSchema = z.object({
  clientId: z.uuid(),
  terms: billingTermsSchema.nullable(), // null = none recorded yet
  // Arithmetic over the terms and the people under management (REP-06's rule).
  // null without terms. An ESTIMATE: the invoice itself is issued elsewhere,
  // and VAT is not calculated here (ADR-020).
  estimate: z
    .object({
      headcount: z.number().int(),
      platformFeeHalalas: z.number().int(),
      seatsHalalas: z.number().int(),
      monthlyHalalas: z.number().int(),
      cycleMonths: z.number().int(),
      cycleHalalas: z.number().int(),
      annualHalalas: z.number().int(),
      nextInvoiceHalalas: z.number().int(), // the cycle + the fees not yet recovered
    })
    .nullable(),
  // Every fee still `recorded`, whatever its age — what is owed for fees.
  unrecoveredFeesHalalas: z.number().int(),
  // BILL-05: derived from the invoice records, never set by hand.
  standing: z.object({
    state: z.enum(ACCOUNT_STANDINGS),
    outstandingHalalas: z.number().int(), // every unpaid invoice
    overdueHalalas: z.number().int(), // the unpaid ones past their due date
    overdueCount: z.number().int(),
  }),
  termsUpdatedBy: z.string().nullable(), // a display name
  termsUpdatedAt: z.string().nullable(), // ISO 8601
});

// ---------------------------------------------------------------------------
// Invoice records (BILL-05). `billing.update` writes, `billing.read` reads.
// The number, dates and amount are entered AS ISSUED — nothing is numbered,
// rendered or taxed here. The fees an invoice recovers become `invoiced`.
// ---------------------------------------------------------------------------

export const invoiceStatusSchema = z.enum(INVOICE_STATUSES);
const invoiceNumber = z.string().trim().min(1).max(40);
const invoiceAmount = z.number().int().min(1).max(MAX_INVOICE_HALALAS);
const invoiceFeeIds = z
  .array(z.uuid())
  .max(MAX_INVOICE_FEES)
  .refine((ids) => new Set(ids).size === ids.length, 'A fee is listed twice');

export const createInvoiceRequestSchema = z.strictObject({
  number: invoiceNumber,
  issuedOn: dateOnly,
  dueOn: dateOnly,
  amountHalalas: invoiceAmount,
  feeIds: invoiceFeeIds.default([]),
});

// A correction, while the invoice is unpaid. `feeIds` REPLACES the set: a fee
// left out goes back to `recorded`.
export const updateInvoiceRequestSchema = z
  .strictObject({
    number: invoiceNumber.optional(),
    issuedOn: dateOnly.optional(),
    dueOn: dateOnly.optional(),
    amountHalalas: invoiceAmount.optional(),
    feeIds: invoiceFeeIds.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to change');

export const markInvoicePaidRequestSchema = z.strictObject({ paidOn: dateOnly });

export const invoiceResponseSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  number: z.string(),
  issuedOn: z.string(), // YYYY-MM-DD
  dueOn: z.string(),
  amountHalalas: z.number().int(),
  status: invoiceStatusSchema,
  paidOn: z.string().nullable(),
  // Derived at the moment of asking: unpaid and past its due date.
  overdue: z.boolean(),
  fees: z.array(z.object({ id: z.uuid(), ref: z.string(), amountHalalas: z.number().int() })),
  feesHalalas: z.number().int(),
  recordedBy: z.string().nullable(), // a display name, never an id
  recordedAt: z.string(), // ISO 8601
});
export const invoiceListResponseSchema = z.object({ invoices: z.array(invoiceResponseSchema) });

export type CreateInvoiceRequest = z.infer<typeof createInvoiceRequestSchema>;
export type UpdateInvoiceRequest = z.infer<typeof updateInvoiceRequestSchema>;
export type MarkInvoicePaidRequest = z.infer<typeof markInvoicePaidRequestSchema>;
export type InvoiceResponse = z.infer<typeof invoiceResponseSchema>;
export type InvoiceListResponse = z.infer<typeof invoiceListResponseSchema>;
export type BillingTerms = z.infer<typeof billingTermsSchema>;
export type BillingSummaryResponse = z.infer<typeof billingSummaryResponseSchema>;
export type CreateFeeRequest = z.infer<typeof createFeeRequestSchema>;
export type UpdateFeeRequest = z.infer<typeof updateFeeRequestSchema>;
export type VoidFeeRequest = z.infer<typeof voidFeeRequestSchema>;
export type FeeQuery = z.infer<typeof feeQuerySchema>;
export type FeeResponse = z.infer<typeof feeResponseSchema>;
export type FeeListResponse = z.infer<typeof feeListResponseSchema>;
export type FeeSource = z.infer<typeof feeSourceSchema>;
export type FeeReceiptUploadRequest = z.infer<typeof feeReceiptUploadRequestSchema>;
export type FeeReceiptUploadResponse = z.infer<typeof feeReceiptUploadResponseSchema>;
export type FeeReceiptDownloadResponse = z.infer<typeof feeReceiptDownloadResponseSchema>;
