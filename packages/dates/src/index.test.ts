import { describe, expect, it } from 'vitest';
import { formatGregorian, formatHijri, gregorianFromHijri, hijriParts } from './index.js';

// Fixtures: officially observed Umm al-Qura ↔ Gregorian pairs in Saudi Arabia.
// Dates constructed at noon UTC so day boundaries are shift-safe.
const FIXTURES: Array<{
  label: string;
  gregorian: Date;
  hijri: { year: number; month: number; day: number };
}> = [
  {
    label: 'Ramadan 1445 begins',
    gregorian: new Date(Date.UTC(2024, 2, 11, 12)),
    hijri: { year: 1445, month: 9, day: 1 },
  },
  {
    label: 'Eid al-Fitr 1445',
    gregorian: new Date(Date.UTC(2024, 3, 10, 12)),
    hijri: { year: 1445, month: 10, day: 1 },
  },
  {
    label: 'Day of Arafah 1445',
    gregorian: new Date(Date.UTC(2024, 5, 15, 12)),
    hijri: { year: 1445, month: 12, day: 9 },
  },
  {
    label: 'Hijri new year 1446',
    gregorian: new Date(Date.UTC(2024, 6, 7, 12)),
    hijri: { year: 1446, month: 1, day: 1 },
  },
  {
    label: 'Ramadan 1446 begins',
    gregorian: new Date(Date.UTC(2025, 2, 1, 12)),
    hijri: { year: 1446, month: 9, day: 1 },
  },
  {
    label: 'Eid al-Fitr 1446',
    gregorian: new Date(Date.UTC(2025, 2, 30, 12)),
    hijri: { year: 1446, month: 10, day: 1 },
  },
];

describe('hijriParts (Gregorian → Umm al-Qura)', () => {
  for (const f of FIXTURES) {
    it(f.label, () => {
      expect(hijriParts(f.gregorian)).toEqual(f.hijri);
    });
  }
});

describe('gregorianFromHijri (Umm al-Qura → Gregorian)', () => {
  for (const f of FIXTURES) {
    it(`${f.label} (reverse)`, () => {
      const g = gregorianFromHijri(f.hijri.year, f.hijri.month, f.hijri.day);
      expect(g.toISOString().slice(0, 10)).toBe(f.gregorian.toISOString().slice(0, 10));
    });
  }

  it('round-trips every day of Ramadan 1446 (a 29-day month)', () => {
    for (let day = 1; day <= 29; day++) {
      const g = gregorianFromHijri(1446, 9, day);
      expect(hijriParts(g)).toEqual({ year: 1446, month: 9, day });
    }
    // Ramadan 1446 had 29 days (Eid on 2025-03-30) — day 30 must not resolve.
    expect(() => gregorianFromHijri(1446, 9, 30)).toThrow(RangeError);
  });

  it('rejects impossible dates', () => {
    expect(() => gregorianFromHijri(1446, 13, 1)).toThrow(RangeError);
    expect(() => gregorianFromHijri(1446, 9, 31)).toThrow(RangeError);
  });
});

describe('formatting', () => {
  it('formats Hijri in Arabic with the month name', () => {
    const s = formatHijri(new Date(Date.UTC(2024, 2, 11, 12)), 'ar');
    expect(s).toContain('رمضان');
  });

  it('formats Hijri in English with the month name', () => {
    const s = formatHijri(new Date(Date.UTC(2024, 2, 11, 12)), 'en');
    expect(s.toLowerCase()).toContain('ramadan');
    expect(s).toContain('1445');
  });

  it('formats Gregorian per locale', () => {
    const d = new Date(Date.UTC(2024, 2, 11, 12));
    expect(formatGregorian(d, 'en')).toContain('March');
    expect(formatGregorian(d, 'ar')).toContain('مارس');
  });
});
