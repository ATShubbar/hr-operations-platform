import { describe, expect, it } from 'vitest';
import {
  carryOverFrom,
  computeBalance,
  entitlementOn,
  monthsAccrued,
  riyadhToday,
  splitByYear,
  type LedgerRow,
} from '../src/modules/leave/public-api';

// LEAVE-03 (ADR-014): the balance arithmetic, figure by figure. Each expected
// number below is worked by hand in its comment.
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('leave balance', () => {
  it('entitlement: 21 days, 30 from the fifth anniversary itself; 21 with no hire date', () => {
    expect(entitlementOn(d('2021-10-04'), d('2026-10-03'))).toBe(21);
    expect(entitlementOn(d('2021-10-04'), d('2026-10-04'))).toBe(30);
    expect(entitlementOn(null, d('2026-10-04'))).toBe(21);
  });

  it('months accrued: the current month counts; a mid-year hire counts from the hire date', () => {
    expect(monthsAccrued(d('2015-01-01'), d('2026-01-01'))).toBe(1); // day 0 → 1
    // 1 Jan → 4 Oct is 276 days: floor(276 / 30.44) = 9, + 1 = 10
    expect(monthsAccrued(d('2015-01-01'), d('2026-10-04'))).toBe(10);
    expect(monthsAccrued(d('2015-01-01'), d('2026-12-31'))).toBe(12); // capped
    // Hired 15 Jun: 111 days to 4 Oct → floor(3.65) + 1 = 4
    expect(monthsAccrued(d('2026-06-15'), d('2026-10-04'))).toBe(4);
    // Hired after "today" → nothing yet.
    expect(monthsAccrued(d('2026-11-01'), d('2026-10-04'))).toBe(0);
    expect(monthsAccrued(null, d('2026-10-04'))).toBe(10);
  });

  it('splits leave crossing 31 December by day', () => {
    expect(splitByYear(d('2026-12-28'), 9)).toEqual([
      { leaveYear: 2026, startDate: d('2026-12-28'), endDate: d('2026-12-31'), days: 4 },
      { leaveYear: 2027, startDate: d('2027-01-01'), endDate: d('2027-01-05'), days: 5 },
    ]);
    expect(splitByYear(d('2028-02-28'), 3)).toEqual([
      { leaveYear: 2028, startDate: d('2028-02-28'), endDate: d('2028-03-01'), days: 3 }, // leap day inside
    ]);
    expect(splitByYear(d('2026-12-31'), 1)).toHaveLength(1);
  });

  const row = (r: Partial<LedgerRow>): LedgerRow => ({
    kind: 'taken',
    type: 'annual',
    leaveYear: 2026,
    endDate: d('2026-03-01'),
    days: 1,
    ...r,
  });

  it('this year only: carried + accrued − taken − booked; pending shown, never deducted', () => {
    const b = computeBalance({
      hireDate: d('2024-03-10'), // < 5 years → 21
      today: d('2026-10-04'), // 10 months → round(21 / 12 × 10) = round(17.5) = 18
      entries: [
        row({ kind: 'carried', endDate: null, days: 5 }),
        row({ endDate: d('2026-05-03'), days: 3 }), // ended → taken
        row({ endDate: d('2026-10-04'), days: 2 }), // ends today → taken
        row({ endDate: d('2026-11-04'), days: 4 }), // future → booked
        row({ type: 'sick', days: 2 }),
        row({ type: 'unpaid', days: 1 }),
        row({ leaveYear: 2025, endDate: d('2025-08-01'), days: 10 }), // last year: ignored
        row({ kind: 'carried', leaveYear: 2025, endDate: null, days: 7 }), // ignored
      ],
      pendingAnnualDays: 6,
    });
    expect(b).toEqual({
      year: 2026,
      entitlement: 21,
      accrued: 18,
      carried: 5,
      taken: 5,
      booked: 4,
      pending: 6,
      available: 14, // 18 + 5 − 5 − 4
      overdrawn: false,
      sick: 2,
      unpaid: 1,
    });
  });

  it('goes below zero rather than clamping: overdrawn, the excess unpaid', () => {
    const b = computeBalance({
      hireDate: d('2026-06-15'), // 4 months → 21 / 12 × 4 = 7
      today: d('2026-10-04'),
      entries: [row({ endDate: d('2026-09-30'), days: 10 })],
      pendingAnnualDays: 0,
    });
    expect(b).toMatchObject({ accrued: 7, taken: 10, available: -3, overdrawn: true });
  });

  it('carry-over: the 31 December balance, at most 10, never negative', () => {
    const veteran = d('2015-01-01'); // 30 a year
    // 30 accrued − 12 taken = 18 → capped at 10
    expect(carryOverFrom({ hireDate: veteran, year: 2025, entries: [row({ leaveYear: 2025, endDate: d('2025-04-01'), days: 12 })] })).toBe(10);
    // 30 − 25 = 5
    expect(carryOverFrom({ hireDate: veteran, year: 2025, entries: [row({ leaveYear: 2025, endDate: d('2025-04-01'), days: 25 })] })).toBe(5);
    // overdrawn → nothing
    expect(carryOverFrom({ hireDate: veteran, year: 2025, entries: [row({ leaveYear: 2025, endDate: d('2025-04-01'), days: 33 })] })).toBe(0);
    // Hired 1 Jul 2025: 183 days to 31 Dec → 7 months → round(21 / 12 × 7) = round(12.25) = 12 → 10
    expect(carryOverFrom({ hireDate: d('2025-07-01'), year: 2025, entries: [] })).toBe(10);
    // Last year's carried credit counts toward this year's closing balance:
    // 30 + 4 carried − 30 taken = 4
    expect(
      carryOverFrom({
        hireDate: veteran,
        year: 2025,
        entries: [
          row({ kind: 'carried', leaveYear: 2025, endDate: null, days: 4 }),
          row({ leaveYear: 2025, endDate: d('2025-04-01'), days: 30 }),
        ],
      }),
    ).toBe(4);
  });

  it('"today" is Riyadh’s calendar day, whatever the server zone', () => {
    // 21:30 UTC on 4 Oct is 00:30 on 5 Oct in Riyadh (UTC+3).
    expect(riyadhToday(new Date('2026-10-04T21:30:00Z'))).toEqual(d('2026-10-05'));
    expect(riyadhToday(new Date('2026-10-04T20:30:00Z'))).toEqual(d('2026-10-04'));
  });
});
