// Expiry warning tiers (EXP-01), in days-to-expiry. A document approaching its
// expiry date escalates through these buckets — 60 → 30 → 14 → 7 → 1 → 0 — and
// fires each tier at most once (the exp_alerts ledger enforces that). Tier 0 is
// "expired or expires today". These are the v1 defaults; a later card may make
// them client-configurable (the CONF substrate).
export const EXPIRY_THRESHOLDS = [0, 1, 7, 14, 30, 60] as const;

// The widest window we scan — documents further out than this raise nothing.
// (The largest tier; kept explicit so it isn't an index that reads as possibly
// undefined under noUncheckedIndexedAccess.)
export const MAX_THRESHOLD = 60;

// The single tier a document at `daysUntil` days-to-expiry currently sits in:
// the SMALLEST threshold it has already reached. A doc 25 days out → tier 30; at
// 5 days → tier 7; expired (≤ 0) → tier 0; beyond the widest window → null (no
// alert). Because the tier only shrinks as the date nears and each fires once,
// a daily scan escalates cleanly without ever re-alerting a tier.
export function tierFor(daysUntil: number): number | null {
  for (const t of EXPIRY_THRESHOLDS) {
    if (daysUntil <= t) return t;
  }
  return null;
}

// Whole days between two dates, counted on the calendar (UTC date components) so
// the result is tz/DST-stable — expiry_date is a DATE column (midnight UTC) and
// the scan date is normalised the same way. Negative = already past.
export function daysUntil(asOf: Date, target: Date): number {
  const a = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  const b = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  return Math.round((b - a) / 86_400_000);
}

// The scan horizon: the latest expiry date still worth loading for a given scan
// date (asOf + widest tier). Anything past it is outside every window.
export function scanHorizon(asOf: Date): Date {
  const d = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate() + MAX_THRESHOLD),
  );
  return d;
}
