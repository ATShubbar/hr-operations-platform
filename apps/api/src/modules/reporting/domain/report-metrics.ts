// Pure aggregate helpers shared by the report producers (REP-01). Kept in
// domain/ and free of Prisma so the arithmetic is testable on its own and the
// same bucket definition is used by every report that talks about expiry.

// Expiry horizon buckets. `expired` is strictly in the past; the rest are
// cumulative-exclusive (an item ≤30 days out is NOT also counted in ≤60), so a
// row's buckets sum to its total without double-counting.
export const EXPIRY_BUCKETS = ['expired', 'due30', 'due60', 'due90'] as const;
export type ExpiryBucket = (typeof EXPIRY_BUCKETS)[number];

// Whole days from `from` to `to`, anchored at UTC midnight on both sides so a
// local-offset time-of-day never shifts an item across a bucket boundary (the
// CAL-03 month-boundary bug, in miniature).
export function daysUntil(to: Date, from: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / 86_400_000);
}

// The bucket a date falls in, or null when it is further out than the 90-day
// horizon (or absent) — i.e. not a compliance concern yet.
export function expiryBucket(date: Date | null | undefined, now: Date): ExpiryBucket | null {
  if (!date) return null;
  const days = daysUntil(date, now);
  if (days < 0) return 'expired';
  if (days <= 30) return 'due30';
  if (days <= 60) return 'due60';
  if (days <= 90) return 'due90';
  return null;
}

// A deadline is overdue when it fell before today. Whether the item is still
// ACTIVE is the caller's business (a completed process with a past due date is
// not overdue), so this helper answers only the date question.
export function isPastDue(dueDate: Date | null | undefined, now: Date): boolean {
  return dueDate != null && daysUntil(dueDate, now) < 0;
}

// Prisma Decimal (or null) → number. Structurally typed, matching
// employees/domain/employee-view.ts, so no Prisma type leaks into domain/.
export function money(value: { toNumber(): number } | null | undefined): number {
  return value == null ? 0 : value.toNumber();
}

// Round to 2 decimals — money totals and percentages, never raw float noise.
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Tally helper: increment `key` in a plain counter object.
export function bump(counter: Record<string, number>, key: string, by = 1): void {
  counter[key] = (counter[key] ?? 0) + by;
}
