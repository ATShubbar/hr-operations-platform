import type { LeaveType } from '@hr/contracts';

// The leave types, in the prototype's order, with the two facts the screens need
// for ADVISORY notes (ADR-014): the per-request statutory cap and whether the
// type reduces the annual balance. The server is the authority — it refuses an
// over-cap request and a second Hajj (LEAVE-02); this only lets the dialog say
// so before the person submits.
export const LEAVE_TYPES: readonly LeaveType[] = [
  'annual',
  'sick',
  'maternity',
  'paternity',
  'marriage',
  'bereavement',
  'hajj',
  'emergency',
  'unpaid',
];

export const LEAVE_CAP: Readonly<Partial<Record<LeaveType, number>>> = {
  sick: 120,
  maternity: 84,
  paternity: 3,
  marriage: 5,
  bereavement: 5,
  hajj: 15,
};

export const deductsBalance = (type: LeaveType): boolean => type === 'annual';

// Leave dates are date-only (YYYY-MM-DD), so they are handled at UTC midnight
// and formatted in UTC — never shifted by the browser's zone.
export const leaveDate = (ymd: string): Date => new Date(`${ymd}T00:00:00Z`);

export function addDays(ymd: string, days: number): string {
  const d = leaveDate(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Do two leave spells overlap? (Both ends inclusive.)
export const overlaps = (a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }) =>
  a.startDate <= b.endDate && b.startDate <= a.endDate;

// Today as the calendar day in Riyadh — what "away today" means for a Saudi workforce.
export function riyadhToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
}
