// The client profile's fixed lists (PROF-01, ADR-019) — cities, sectors, the
// Nitaqat ladder, portals, and the two service lists. Stored as KEYS; every
// screen translates them. A list grows by a change here (and a translation).
//
// No zod here on purpose — the web imports this through the `@hr/contracts/
// client-profile` subpath (the DS-06 landmine), like `headcount` and
// `work-status`. `client-company.ts` builds its zod enums from these arrays.

export const CLIENT_CITIES = [
  'riyadh',
  'jeddah',
  'dammam',
  'khobar',
  'jubail',
  'makkah',
  'madinah',
  'abha',
  'tabuk',
] as const;
export type ClientCity = (typeof CLIENT_CITIES)[number];

export const CLIENT_SECTORS = [
  'wholesale_retail',
  'construction',
  'transport_storage',
  'marine_services',
  'software',
  'facilities',
  'manufacturing',
  'hospitality',
  'healthcare',
] as const;
export type ClientSector = (typeof CLIENT_SECTORS)[number];

// The Nitaqat ladder, WORST FIRST — the order is the ladder ("next band up" is
// the next entry). The band is what staff read off Qiwa; nothing computes it.
export const NITAQAT_BANDS = [
  'red',
  'yellow',
  'low_green',
  'medium_green',
  'high_green',
  'platinum',
] as const;
export type NitaqatBand = (typeof NITAQAT_BANDS)[number];

/** The band one step up the ladder, or null at the top. */
export function bandAbove(band: NitaqatBand): NitaqatBand | null {
  return NITAQAT_BANDS[NITAQAT_BANDS.indexOf(band) + 1] ?? null;
}

/** The band one step down the ladder, or null at the bottom. */
export function bandBelow(band: NitaqatBand): NitaqatBand | null {
  const i = NITAQAT_BANDS.indexOf(band);
  return i > 0 ? (NITAQAT_BANDS[i - 1] ?? null) : null;
}

// Government portals PEOPLE&GRO may hold credentials FOR. Names only: the app
// records that access exists, never a username, password or token (ADR-019).
export const CLIENT_PORTALS = ['qiwa', 'muqeem', 'gosi', 'absher', 'mudad', 'balady'] as const;
export type ClientPortal = (typeof CLIENT_PORTALS)[number];

// Recorded facts with no behaviour attached (ADR-019): the tier switches
// nothing on, and the commitment is a label — request due dates keep coming
// from the per-type service levels (ADR-016 rev. 3).
export const SERVICE_TIERS = ['essential', 'professional', 'enterprise'] as const;
export type ServiceTier = (typeof SERVICE_TIERS)[number];

export const RESPONSE_COMMITMENTS = [
  'same_working_day',
  'one_working_day',
  'two_working_days',
] as const;
export type ResponseCommitment = (typeof RESPONSE_COMMITMENTS)[number];

/** How many authorised signatories a client may list. */
export const MAX_SIGNATORIES = 10;

// ---------------------------------------------------------------------------
// The band warning (PROF-06, ADR-019) — ONE rule for every screen that warns,
// so they cannot disagree. A warning NEVER blocks: the stored band may be out
// of date and Qiwa is the authority, so the server refuses nothing. This only
// decides whether a line of text is shown, and which band it names.
//
//   Red    ("work permits and transfers are blocked… every hire must be Saudi")
//          → a non-Saudi hire; a work-permit renewal; a sponsorship transfer.
//   Yellow ("renewals still pass, but new permits are restricted")
//          → a non-Saudi hire only.
//   Greens, Platinum, or no band on file → never.
// ---------------------------------------------------------------------------

/** The procedure types a RED band warns about. */
export const RED_BAND_PROCEDURES: readonly string[] = [
  'work_permit_renewal',
  'sponsorship_transfer',
];

export type BandCheck =
  /** Moving a candidate to Visa & mobilisation, or onboarding them directly. */
  | { kind: 'hire'; saudi: boolean }
  /** Starting a government procedure of this type. */
  | { kind: 'procedure'; type: string };

/** The band to warn about for this action, or null when nothing should be said. */
export function bandWarning(
  band: NitaqatBand | null | undefined,
  check: BandCheck,
): 'red' | 'yellow' | null {
  if (band !== 'red' && band !== 'yellow') return null;
  if (check.kind === 'hire') return check.saudi ? null : band;
  return band === 'red' && RED_BAND_PROCEDURES.includes(check.type) ? 'red' : null;
}
