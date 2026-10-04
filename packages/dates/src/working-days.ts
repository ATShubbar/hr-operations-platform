// Working-day arithmetic for service levels (THREAD-04, ADR-016). A "day" is a
// calendar day carried as UTC midnight — the storage rule (Gregorian UTC; due
// dates have no time). `week` lists the working weekdays, 0=Sunday … 6=Saturday
// (the `working.week` setting; Sun–Thu in Saudi Arabia). Public holidays are NOT
// modelled yet — a known gap ADR-016 records.

const DAY_MS = 86_400_000;

const nextDay = (day: Date): Date => new Date(day.getTime() + DAY_MS);

/**
 * The date `n` working days after `day`, counting from the NEXT working day
 * (raised Sunday + 2 → Tuesday; raised Thursday + 1 → Sunday). n = 0 is `day`.
 */
export function addWorkingDays(day: Date, n: number, week: readonly number[]): Date {
  if (!Number.isInteger(n) || n < 0) throw new RangeError('n must be a whole number ≥ 0');
  if (!week.some((w) => w >= 0 && w <= 6)) throw new RangeError('the week has no working days');
  let cursor = startOfDay(day);
  let left = n;
  while (left > 0) {
    cursor = nextDay(cursor);
    if (week.includes(cursor.getUTCDay())) left -= 1;
  }
  return cursor;
}

/** Working days after `from` up to and including `to` (0 when `to` ≤ `from`). */
export function workingDaysBetween(from: Date, to: Date, week: readonly number[]): number {
  let cursor = startOfDay(from);
  const end = startOfDay(to);
  let count = 0;
  while (cursor < end) {
    cursor = nextDay(cursor);
    if (week.includes(cursor.getUTCDay())) count += 1;
  }
  return count;
}

/** The calendar day `instant` falls on in `timeZone`, as UTC midnight. */
export function dayIn(instant: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00Z`);
}

function startOfDay(day: Date): Date {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
}
