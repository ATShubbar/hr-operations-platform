import type { Prisma } from '../../../generated/prisma/client';

// What an edit changed (ADR-022, AUDIT-11).
//
// An audit entry for an edit must say what changed, from what to what. A module
// that hands the trail a fixed "snapshot" of a few fields records NOTHING for a
// change to any other field — an employee's job title, salary or iqama date used
// to leave an entry whose before and after were identical.
//
// `auditEdit` compares the stored row before and after the edit, column by
// column, and returns the two halves of the entry: what identifies the record
// (always present, so the entry reads on its own) plus EVERY field whose value
// differs — the old value in `before`, the new in `after`. Unchanged fields are
// not repeated. Because it walks the row itself, a column added later is
// recorded without anyone remembering to list it.
//
// Values are recorded as they are — pay amounts and ID numbers included (owner
// decision, ADR-022). The trail's readers are the Administrator and the Auditor.

type Row = Record<string, unknown>;
type Values = Record<string, Prisma.InputJsonValue | null>;

// Never a change worth recording: the key, and the row's own bookkeeping.
const BOOKKEEPING = new Set(['id', 'createdAt', 'updatedAt']);

/** A stored value as the trail records it: a day as YYYY-MM-DD, an instant as ISO, a decimal as a number. */
export function auditValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const iso = value.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof (value as { toNumber?: unknown }).toNumber === 'function') {
    return (value as { toNumber(): number }).toNumber();
  }
  // A list or a JSON column.
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(auditValue(a)) === JSON.stringify(auditValue(b));

/** The fields whose value differs between the two rows: old values, and new values. */
export function changedValues(
  before: Row,
  after: Row,
  skip: readonly string[] = [],
): { before: Values; after: Values } {
  const out = { before: {} as Values, after: {} as Values };
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (BOOKKEEPING.has(key) || skip.includes(key)) continue;
    if (same(before[key], after[key])) continue;
    out.before[key] = auditValue(before[key]);
    out.after[key] = auditValue(after[key]);
  }
  return out;
}

/**
 * The two halves of an edit's entry. `identify` gives what names the record (and
 * whatever else the module has always recorded); every changed field is added.
 */
export function auditEdit<T extends object>(
  before: T,
  after: T,
  identify: (row: T) => Prisma.InputJsonValue,
  skip: readonly string[] = [],
): { before: Prisma.InputJsonValue; after: Prisma.InputJsonValue } {
  const changed = changedValues(before as Row, after as Row, skip);
  return {
    before: { ...(identify(before) as Values), ...changed.before },
    after: { ...(identify(after) as Values), ...changed.after },
  };
}

/** What a new record was created with: what identifies it, plus every field that holds a value. */
export function auditCreated<T extends object>(
  row: T,
  identify: (row: T) => Prisma.InputJsonValue,
  skip: readonly string[] = [],
): Prisma.InputJsonValue {
  const values: Values = {};
  for (const [key, value] of Object.entries(row as Row)) {
    if (BOOKKEEPING.has(key) || skip.includes(key)) continue;
    const recorded = auditValue(value);
    if (recorded === null || recorded === '') continue;
    values[key] = recorded;
  }
  return { ...values, ...(identify(row) as Values) };
}
