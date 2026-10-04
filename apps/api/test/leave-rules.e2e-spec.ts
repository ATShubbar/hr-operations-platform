import { describe, expect, it } from 'vitest';
import {
  LEAVE_TYPES,
  canMove,
  leaveEndDate,
  raiseRefusal,
} from '../src/modules/leave/public-api';

// LEAVE-01 (ADR-014): the pure leave rules every data path runs.
describe('leave rules', () => {
  const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

  it('counts calendar days: the end is start + days − 1, across months and years', () => {
    expect(leaveEndDate(d('2026-10-04'), 1)).toEqual(d('2026-10-04'));
    expect(leaveEndDate(d('2026-10-04'), 5)).toEqual(d('2026-10-08'));
    expect(leaveEndDate(d('2026-12-30'), 5)).toEqual(d('2027-01-03'));
    expect(leaveEndDate(d('2028-02-28'), 2)).toEqual(d('2028-02-29')); // leap year
  });

  it('only annual leave reduces the balance', () => {
    const deducting = Object.entries(LEAVE_TYPES).filter(([, r]) => r.deducts).map(([k]) => k);
    expect(deducting).toEqual(['annual']);
  });

  const ok = { type: 'annual' as const, days: 5, employeeStatus: 'active', hajjOnRecord: false };

  it('accepts an ordinary request', () => {
    expect(raiseRefusal(ok)).toBeNull();
    // Annual leave has no per-request cap: it may exceed the balance (the excess is unpaid).
    expect(raiseRefusal({ ...ok, days: 60 })).toBeNull();
  });

  it('refuses a leaver, and day counts outside 1..365 or not whole', () => {
    expect(raiseRefusal({ ...ok, employeeStatus: 'terminated' })).toMatch(/has left/);
    expect(raiseRefusal({ ...ok, days: 0 })).toMatch(/1 to 365/);
    expect(raiseRefusal({ ...ok, days: 366 })).toMatch(/1 to 365/);
    expect(raiseRefusal({ ...ok, days: 2.5 })).toMatch(/whole number/);
  });

  it('refuses more than a type’s statutory cap in one request', () => {
    expect(raiseRefusal({ ...ok, type: 'paternity', days: 3 })).toBeNull();
    expect(raiseRefusal({ ...ok, type: 'paternity', days: 4 })).toMatch(/capped at 3 days/);
    expect(raiseRefusal({ ...ok, type: 'sick', days: 120 })).toBeNull();
    expect(raiseRefusal({ ...ok, type: 'sick', days: 121 })).toMatch(/capped at 120/);
    expect(raiseRefusal({ ...ok, type: 'maternity', days: 85 })).toMatch(/capped at 84/);
  });

  it('grants Hajj once during service', () => {
    expect(raiseRefusal({ ...ok, type: 'hajj', days: 15 })).toBeNull();
    expect(raiseRefusal({ ...ok, type: 'hajj', days: 10, hajjOnRecord: true })).toMatch(/once/);
    // The once-only rule is Hajj's alone.
    expect(raiseRefusal({ ...ok, type: 'annual', hajjOnRecord: true })).toBeNull();
  });

  it('moves pending → approved | declined | withdrawn, approved → filed, nothing else', () => {
    expect(canMove('pending', 'approved')).toBe(true);
    expect(canMove('pending', 'declined')).toBe(true);
    expect(canMove('pending', 'withdrawn')).toBe(true);
    expect(canMove('approved', 'filed')).toBe(true);
    // Filing skips nothing; decisions are not undone; terminal stays terminal.
    expect(canMove('pending', 'filed')).toBe(false);
    expect(canMove('approved', 'withdrawn')).toBe(false);
    expect(canMove('approved', 'declined')).toBe(false);
    for (const t of ['declined', 'withdrawn', 'filed'] as const) {
      for (const to of ['pending', 'approved', 'declined', 'withdrawn', 'filed'] as const) {
        expect(canMove(t, to)).toBe(false);
      }
    }
  });
});
