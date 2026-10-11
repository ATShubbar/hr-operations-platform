// Billing's fixed lists and the DEFAULT standard fees (BILL-01, ADR-020).
//
// No zod here on purpose — the web imports this through the `@hr/contracts/
// billing-lists` subpath (the DS-06 landmine), like `client-profile`.
//
// MONEY IS WHOLE HALALAS everywhere in the API and the database (SAR 1 = 100
// halalas), so nothing is ever rounded in storage. Screens format it.

/** Who a fee was paid to. `other` covers anything not on the list. */
export const FEE_AUTHORITIES = [
  'qiwa',
  'muqeem',
  'gosi',
  'absher',
  'mudad',
  'balady',
  'mofa',
  'enjaz',
  'gamca',
  'seha',
  'cchi',
  'chamber',
  'other',
] as const;
export type FeeAuthority = (typeof FEE_AUTHORITIES)[number];

/** A sequence step's portal, as its definition names it, → the authority paid. */
export function authorityOfPortal(portal: string): FeeAuthority {
  const key = portal.toLowerCase();
  return (FEE_AUTHORITIES as readonly string[]).includes(key) ? (key as FeeAuthority) : 'other';
}

/** The largest single fee the ledger accepts: SAR 1,000,000. */
export const MAX_FEE_HALALAS = 100_000_000;

// A fee's receipt (BILL-02): the same types and size every upload accepts.
export const FEE_RECEIPT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const FEE_RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const FEE_RECEIPT_STATUSES = ['pending', 'available', 'quarantined', 'rejected'] as const;
export type FeeReceiptStatus = (typeof FEE_RECEIPT_STATUSES)[number];

/**
 * The reason stored on a fee the SYSTEM voided because its step was reopened.
 * A key, not a sentence: screens translate it.
 */
export const VOID_REASON_STEP_REOPENED = 'system:step-reopened';

export const FEE_STATUSES = ['recorded', 'invoiced', 'void'] as const;
export type FeeStatus = (typeof FEE_STATUSES)[number];

// ---------------------------------------------------------------------------
// Standard fees — what a filing dialog PREFILLS. The person filing confirms or
// corrects the amount actually paid; changing a standard fee never alters a
// fee already recorded.
//
// These defaults are THE PROTOTYPE'S FIGURES and are not verified (ADR-020):
// a starting point the Administrator corrects in Settings. 0 = no standard fee.
// ---------------------------------------------------------------------------

export interface StandardFees {
  /** By GRO procedure type. */
  procedures: Record<string, number>;
  /** By sequence kind, then step key. */
  steps: { onboarding: Record<string, number>; final_exit: Record<string, number> };
  /** The annual fee for one dependant — shown on the Family tab, never recorded by itself. */
  dependantAnnual: number;
}

export const DEFAULT_STANDARD_FEES: StandardFees = {
  procedures: {
    iqama_issue: 65_000,
    iqama_renewal: 970_000,
    exit_reentry: 20_000,
    final_exit: 10_000,
    profession_change: 0,
    sponsorship_transfer: 200_000,
    work_permit_renewal: 970_000,
    other: 0,
    // INS-04. The prototype prices an insurance renewal and a licence
    // CONVERSION; it gives no figure for a licence renewal, so that starts at 0.
    medical_insurance_renewal: 180_000,
    driving_licence_renewal: 0,
    driving_licence_conversion: 40_000,
  },
  steps: {
    onboarding: {
      'block-visa': 200_000,
      'visa-auth': 0,
      gamca: 0,
      enjaz: 20_000,
      travel: 0,
      'medical-ksa': 30_000,
      iqama: 65_000,
      insurance: 180_000,
      gosi: 0,
      contract: 10_000,
      bank: 0,
    },
    final_exit: {
      notice: 0,
      clearance: 0,
      settlement: 0,
      'gosi-close': 0,
      'contract-close': 0,
      'exit-visa': 10_000,
      ticket: 0,
      depart: 0,
    },
  },
  dependantAnnual: 480_000,
};

/** The standard fee for a sequence step, or 0. */
export function standardStepFee(
  fees: StandardFees,
  kind: 'onboarding' | 'final_exit',
  stepKey: string,
): number {
  return fees.steps[kind]?.[stepKey] ?? 0;
}

/**
 * The standard fee for a procedure type, or 0. A dependant's iqama renewal has
 * no figure of its own: it IS the annual dependant fee (owner decision, DEP-06 —
 * one number in one place, the one the Family tab shows).
 */
export function standardProcedureFee(fees: StandardFees, type: string): number {
  if (type === 'dependant_iqama_renewal') return fees.dependantAnnual;
  return fees.procedures[type] ?? 0;
}

// ---------------------------------------------------------------------------
// Commercial terms (BILL-04, ADR-020): a platform fee plus a rate per employee,
// billed on a cycle. The ESTIMATE of the next invoice is arithmetic over these
// and nothing more — the app issues no invoice and calculates no VAT.
// ---------------------------------------------------------------------------

export const BILLING_CYCLES = ['monthly', 'quarterly', 'annual'] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

/** How many months one invoice covers. */
export const CYCLE_MONTHS: Record<BillingCycle, number> = { monthly: 1, quarterly: 3, annual: 12 };

/** The largest platform fee or per-employee rate: SAR 1,000,000 a month. */
export const MAX_TERM_HALALAS = 100_000_000;

export interface SubscriptionEstimate {
  headcount: number;
  platformFeeHalalas: number;
  seatsHalalas: number;
  monthlyHalalas: number;
  cycleMonths: number;
  cycleHalalas: number;
  annualHalalas: number;
}

/** The subscription for one cycle and one year, from the terms and a headcount. */
export function estimateSubscription(
  terms: { platformFeeHalalas: number; seatRateHalalas: number; cycle: BillingCycle },
  headcount: number,
): SubscriptionEstimate {
  const seatsHalalas = terms.seatRateHalalas * headcount;
  const monthlyHalalas = terms.platformFeeHalalas + seatsHalalas;
  const cycleMonths = CYCLE_MONTHS[terms.cycle];
  return {
    headcount,
    platformFeeHalalas: terms.platformFeeHalalas,
    seatsHalalas,
    monthlyHalalas,
    cycleMonths,
    cycleHalalas: monthlyHalalas * cycleMonths,
    annualHalalas: monthlyHalalas * 12,
  };
}

// ---------------------------------------------------------------------------
// Invoice records (BILL-05). The invoice itself is issued from the accounting
// system; this is the RECORD of it — its number as issued, its dates and its
// amount — and of whether it has been paid.
// ---------------------------------------------------------------------------

/** `sent` until an Administrator marks it `paid`. "Overdue" is never stored. */
export const INVOICE_STATUSES = ['sent', 'paid'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** SAR 20,000,000 — an invoice can carry a year of terms plus fees. */
export const MAX_INVOICE_HALALAS = 2_000_000_000;
/** How many fees one invoice record may recover. */
export const MAX_INVOICE_FEES = 200;

/**
 * A client's standing, DERIVED from its invoice records and never set by hand:
 * `none` — no invoice is recorded; `current` — nothing unpaid is past its due
 * date; `overdue` — at least one unpaid invoice is.
 */
export const ACCOUNT_STANDINGS = ['none', 'current', 'overdue'] as const;
export type AccountStanding = (typeof ACCOUNT_STANDINGS)[number];

/** An unpaid invoice is overdue from the day AFTER its due date. Dates are YYYY-MM-DD. */
export function isOverdue(
  invoice: { status: InvoiceStatus; dueOn: string },
  today: string,
): boolean {
  return invoice.status === 'sent' && invoice.dueOn < today;
}
