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

/** The standard fee for a procedure type, or 0. */
export function standardProcedureFee(fees: StandardFees, type: string): number {
  return fees.procedures[type] ?? 0;
}
