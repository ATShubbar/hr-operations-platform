import { describe, expect, it } from 'vitest';
import { addWorkingDays, dayIn, workingDaysBetween } from './working-days.js';

// THREAD-04: service levels count WORKING days of the company's week (Sun–Thu
// by default — 0=Sunday … 6=Saturday). Days are calendar days carried as UTC
// midnight (the storage rule: Gregorian UTC; due dates have no time).
const SUN_THU = [0, 1, 2, 3, 4];
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);

// October 2026: Thu 1, Fri 2, Sat 3, Sun 4, Mon 5 … Thu 8, Fri 9, Sat 10, Sun 11.
describe('addWorkingDays', () => {
  it('counts from the next working day: raised Sunday, 2 days → Tuesday', () => {
    expect(iso(addWorkingDays(d('2026-10-04'), 2, SUN_THU))).toBe('2026-10-06');
  });

  it('skips the weekend: raised Thursday, 1 day → Sunday; 2 days → Monday', () => {
    expect(iso(addWorkingDays(d('2026-10-01'), 1, SUN_THU))).toBe('2026-10-04');
    expect(iso(addWorkingDays(d('2026-10-01'), 2, SUN_THU))).toBe('2026-10-05');
  });

  it('raised on a weekend day counts from the following working day', () => {
    expect(iso(addWorkingDays(d('2026-10-02'), 1, SUN_THU))).toBe('2026-10-04');
    expect(iso(addWorkingDays(d('2026-10-03'), 5, SUN_THU))).toBe('2026-10-08');
  });

  it('crosses more than one weekend', () => {
    expect(iso(addWorkingDays(d('2026-10-04'), 10, SUN_THU))).toBe('2026-10-18');
  });

  it('zero days is the same day', () => {
    expect(iso(addWorkingDays(d('2026-10-02'), 0, SUN_THU))).toBe('2026-10-02');
  });

  it('follows another working week (Mon–Fri)', () => {
    expect(iso(addWorkingDays(d('2026-10-01'), 2, [1, 2, 3, 4, 5]))).toBe('2026-10-05');
  });

  it('refuses a week with no working days or a negative count', () => {
    expect(() => addWorkingDays(d('2026-10-01'), 1, [])).toThrow();
    expect(() => addWorkingDays(d('2026-10-01'), -1, SUN_THU)).toThrow();
  });
});

describe('workingDaysBetween (the pause)', () => {
  it('counts the working days after `from` up to and including `to`', () => {
    // Asked Sunday, answered Tuesday → Monday + Tuesday = 2 paused days.
    expect(workingDaysBetween(d('2026-10-04'), d('2026-10-06'), SUN_THU)).toBe(2);
  });

  it('a pause across the weekend counts only working days', () => {
    // Asked Thursday, answered the next Sunday → only Sunday counts.
    expect(workingDaysBetween(d('2026-10-01'), d('2026-10-04'), SUN_THU)).toBe(1);
    // Asked Thursday, answered Saturday → nothing.
    expect(workingDaysBetween(d('2026-10-01'), d('2026-10-03'), SUN_THU)).toBe(0);
  });

  it('the same day, or an earlier `to`, is zero', () => {
    expect(workingDaysBetween(d('2026-10-04'), d('2026-10-04'), SUN_THU)).toBe(0);
    expect(workingDaysBetween(d('2026-10-06'), d('2026-10-04'), SUN_THU)).toBe(0);
  });
});

describe('dayIn (today, in a timezone)', () => {
  it('is the calendar day in that zone, carried as UTC midnight', () => {
    // 22:30 UTC on 4 Oct is already 5 Oct in Riyadh (UTC+3).
    expect(iso(dayIn(new Date('2026-10-04T22:30:00Z'), 'Asia/Riyadh'))).toBe('2026-10-05');
    expect(iso(dayIn(new Date('2026-10-04T20:30:00Z'), 'Asia/Riyadh'))).toBe('2026-10-04');
  });
});
