import { describe, expect, it } from 'vitest';
import { isValidTimeZone, utcToZonedWallClock, zonedTimeToUtc } from './zoned-time.js';

// GCAL-04: a time typed on a form means that wall-clock time IN THE CHOSEN ZONE,
// whatever the browser's own zone. These convert between that wall clock
// ("YYYY-MM-DDTHH:mm", what <input type="datetime-local"> gives) and the instant.
const z = (wall: string, tz: string) => zonedTimeToUtc(wall, tz).toISOString();

describe('zonedTimeToUtc', () => {
  it('Riyadh (UTC+3, no DST): 10:00 is 07:00Z — from any browser', () => {
    expect(z('2026-10-06T10:00', 'Asia/Riyadh')).toBe('2026-10-06T07:00:00.000Z');
  });

  it('Dubai (UTC+4): 10:00 is 06:00Z', () => {
    expect(z('2026-10-06T10:00', 'Asia/Dubai')).toBe('2026-10-06T06:00:00.000Z');
  });

  it('a DST zone uses the offset in force on that date (London: summer +1, winter 0)', () => {
    expect(z('2026-07-01T10:00', 'Europe/London')).toBe('2026-07-01T09:00:00.000Z');
    expect(z('2026-12-01T10:00', 'Europe/London')).toBe('2026-12-01T10:00:00.000Z');
  });

  it('crosses a date line correctly (00:30 in Riyadh is the previous day in UTC)', () => {
    expect(z('2026-10-06T00:30', 'Asia/Riyadh')).toBe('2026-10-05T21:30:00.000Z');
  });

  it('a time that never happens (spring-forward gap) moves forward past the gap', () => {
    // New York, 8 Mar 2026: 02:00 → 03:00. 02:30 doesn't exist → 03:30 EDT = 07:30Z.
    expect(z('2026-03-08T02:30', 'America/New_York')).toBe('2026-03-08T07:30:00.000Z');
  });

  it('a time that happens twice (fall-back overlap) takes the FIRST occurrence', () => {
    // New York, 1 Nov 2026: 01:30 happens at EDT (05:30Z) and again at EST (06:30Z).
    expect(z('2026-11-01T01:30', 'America/New_York')).toBe('2026-11-01T05:30:00.000Z');
  });

  it('accepts seconds, and refuses a malformed time or an unknown zone', () => {
    expect(z('2026-10-06T10:00:30', 'Asia/Riyadh')).toBe('2026-10-06T07:00:30.000Z');
    expect(() => zonedTimeToUtc('06/10/2026 10:00', 'Asia/Riyadh')).toThrow();
    expect(() => zonedTimeToUtc('2026-10-06T10:00', 'Asia/Atlantis')).toThrow();
  });
});

describe('utcToZonedWallClock (the inverse, for display)', () => {
  it('shows an instant as the wall clock in a zone', () => {
    expect(utcToZonedWallClock(new Date('2026-10-06T07:00:00Z'), 'Asia/Riyadh')).toBe('2026-10-06T10:00');
    expect(utcToZonedWallClock(new Date('2026-10-05T21:30:00Z'), 'Asia/Riyadh')).toBe('2026-10-06T00:30');
  });

  it('round-trips every hour of a day in several zones', () => {
    for (const tz of ['Asia/Riyadh', 'Asia/Dubai', 'Europe/London', 'Asia/Kolkata']) {
      for (let h = 0; h < 24; h++) {
        const wall = `2026-07-15T${String(h).padStart(2, '0')}:15`;
        expect(utcToZonedWallClock(zonedTimeToUtc(wall, tz), tz)).toBe(wall);
      }
    }
  });
});

describe('isValidTimeZone', () => {
  it('knows real IANA zones and refuses made-up or empty ones', () => {
    expect(isValidTimeZone('Asia/Riyadh')).toBe(true);
    expect(isValidTimeZone('Asia/Atlantis')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});
