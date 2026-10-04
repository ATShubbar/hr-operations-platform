import type { LeaveEntryKind, LeaveType } from '../../../generated/prisma/enums';

// The annual-leave balance (ADR-014, LEAVE-03). Pure: every date is a date-only
// value at UTC midnight, `today` included (the caller decides what "today" is —
// Riyadh's calendar day), so nothing here depends on the server's clock or zone.
//
// The prototype's arithmetic (`leaveBalance`), scoped to ONE leave year — the
// prototype only ever modelled one — plus two owner decisions it doesn't make:
//   * a mid-year hire accrues from the hire date, not from 1 January;
//   * leave crossing 31 December is split by day between the two years.

const DAY_MS = 86_400_000;
// The prototype's month length for accrual (`/ 30.44`), kept so the figures match.
const MONTH_DAYS = 30.44;

export const CARRY_CAP = 10;

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const yearStart = (y: number) => utc(y, 0, 1);
const yearEnd = (y: number) => utc(y, 11, 31);
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY_MS);

// Art. 109 (the prototype's citation): 21 days a year, 30 once the employee has
// completed five years' service — on the anniversary itself. No hire date → 21.
export function entitlementOn(hireDate: Date | null, on: Date): number {
  if (!hireDate) return 21;
  const fifth = utc(hireDate.getUTCFullYear() + 5, hireDate.getUTCMonth(), hireDate.getUTCDate());
  return on.getTime() >= fifth.getTime() ? 30 : 21;
}

// Months accrued in `on`'s leave year: the current month counts (the prototype's
// `floor(days / 30.44) + 1`, at most 12), counted from 1 January — or from the
// hire date when it falls inside this year. Hired after `on` → 0.
export function monthsAccrued(hireDate: Date | null, on: Date): number {
  const start0 = yearStart(on.getUTCFullYear());
  const start = hireDate && hireDate.getTime() > start0.getTime() ? hireDate : start0;
  if (start.getTime() > on.getTime()) return 0;
  return Math.min(12, Math.floor(daysBetween(start, on) / MONTH_DAYS) + 1);
}

// Calendar days split by leave year: 28 Dec + 9 days → 4 in the old year, 5 in
// the new. Filing writes one ledger entry per part.
export function splitByYear(
  start: Date,
  days: number,
): { leaveYear: number; startDate: Date; endDate: Date; days: number }[] {
  const parts: { leaveYear: number; startDate: Date; endDate: Date; days: number }[] = [];
  let from = start;
  let left = days;
  while (left > 0) {
    const year = from.getUTCFullYear();
    const room = daysBetween(from, yearEnd(year)) + 1;
    const take = Math.min(left, room);
    const to = new Date(from.getTime() + (take - 1) * DAY_MS);
    parts.push({ leaveYear: year, startDate: from, endDate: to, days: take });
    left -= take;
    from = yearStart(year + 1);
  }
  return parts;
}

export interface LedgerRow {
  kind: LeaveEntryKind;
  type: LeaveType;
  leaveYear: number;
  endDate: Date | null;
  days: number;
}

export interface Balance {
  year: number;
  entitlement: number;
  accrued: number;
  carried: number;
  taken: number;
  booked: number;
  pending: number;
  // Signed on purpose (the prototype: "clamping that to zero would break the
  // arithmetic"): below zero means overdrawn — the excess is unpaid.
  available: number;
  overdrawn: boolean;
  sick: number;
  unpaid: number;
}

export function computeBalance(input: {
  hireDate: Date | null;
  today: Date;
  entries: readonly LedgerRow[];
  // Annual leave asked for but not yet filed — shown, never deducted.
  pendingAnnualDays: number;
}): Balance {
  const year = input.today.getUTCFullYear();
  const entitlement = entitlementOn(input.hireDate, input.today);
  const accrued = Math.round((entitlement / 12) * monthsAccrued(input.hireDate, input.today));
  const thisYear = input.entries.filter((e) => e.leaveYear === year);
  const sum = (rows: readonly LedgerRow[]) => rows.reduce((n, e) => n + e.days, 0);

  const carried = sum(thisYear.filter((e) => e.kind === 'carried'));
  const annual = thisYear.filter((e) => e.kind === 'taken' && e.type === 'annual');
  const ended = (e: LedgerRow) => e.endDate !== null && e.endDate.getTime() <= input.today.getTime();
  const taken = sum(annual.filter(ended));
  const booked = sum(annual.filter((e) => !ended(e)));
  const available = accrued + carried - taken - booked;

  return {
    year,
    entitlement,
    accrued,
    carried,
    taken,
    booked,
    pending: input.pendingAnnualDays,
    available,
    overdrawn: available < 0,
    sick: sum(thisYear.filter((e) => e.kind === 'taken' && e.type === 'sick')),
    unpaid: sum(thisYear.filter((e) => e.kind === 'taken' && e.type === 'unpaid')),
  };
}

// What a year leaves behind for the next: the balance on 31 December, never
// negative (an overdrawn year carries nothing — the excess was unpaid), at most
// CARRY_CAP (anything above it is forfeited).
export function carryOverFrom(input: {
  hireDate: Date | null;
  year: number;
  entries: readonly LedgerRow[];
}): number {
  const closing = computeBalance({
    hireDate: input.hireDate,
    today: yearEnd(input.year),
    entries: input.entries,
    pendingAnnualDays: 0,
  });
  return Math.max(0, Math.min(CARRY_CAP, closing.available));
}

// "Today" as Riyadh's calendar day, at UTC midnight — the date a person in the
// Kingdom would say it is, whatever the server's zone.
export function riyadhToday(now: Date = new Date()): Date {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' })
    .format(now)
    .split('-')
    .map(Number) as [number, number, number];
  return utc(y, m - 1, d);
}
