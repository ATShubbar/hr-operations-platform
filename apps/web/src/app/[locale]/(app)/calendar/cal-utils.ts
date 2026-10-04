import type { CalendarItem } from '@hr/contracts';
import { hijriParts } from '@hr/dates';

// Date helpers for the calendar (DS-14). Days are handled as YYYY-MM-DD strings and
// all arithmetic is UTC-anchored, so no local offset can shift a day boundary.
// (CAL-03 learned this: local-midnight bounds mislabelled the month.)

export type Iso = string; // YYYY-MM-DD

export const isoOf = (d: Date): Iso => d.toISOString().slice(0, 10);
const at = (iso: Iso) => new Date(`${iso}T00:00:00Z`);

export function addDays(iso: Iso, n: number): Iso {
  const d = at(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return isoOf(d);
}

/** 0 = Sunday — the prototype's (and the Saudi working week's) first column. */
export const dowOf = (iso: Iso) => at(iso).getUTCDay();

/** Today in the viewer's own calendar day. */
export function todayIso(): Iso {
  const n = new Date();
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}

export const monthOf = (iso: Iso) => iso.slice(0, 7); // YYYY-MM

export function shiftMonth(iso: Iso, delta: number): Iso {
  const d = at(`${iso.slice(0, 7)}-01`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return isoOf(d);
}

/** The month grid: whole Sunday-first weeks covering the month (5 or 6 rows). */
export function monthGrid(iso: Iso): Iso[] {
  const first = `${iso.slice(0, 7)}-01`;
  const start = addDays(first, -dowOf(first));
  const last = addDays(shiftMonth(first, 1), -1);
  const end = addDays(last, 6 - dowOf(last));
  const out: Iso[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export const weekOf = (iso: Iso): Iso[] => {
  const start = addDays(iso, -dowOf(iso));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
};

/**
 * The day an item belongs to. A deadline is all-day on its (UTC) due date; a timed
 * event belongs to the viewer's own local day — an 01:00 Riyadh meeting is that
 * day's, not the previous UTC day's.
 */
export function dayKey(item: CalendarItem): Iso {
  if (item.allDay) return item.startAt.slice(0, 10);
  const d = new Date(item.startAt);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** HH:MM for a timed event, '' for all-day. */
export function timeOf(item: CalendarItem): string {
  if (item.allDay) return '';
  const d = new Date(item.startAt);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** The Hijri day-of-month (Umm al-Qura) for a Gregorian day. */
export const hijriDay = (iso: Iso) => hijriParts(new Date(`${iso}T12:00:00Z`)).day;

/** The Hijri month(s) a Gregorian range spans — one name, or "A – B 1448". */
export function hijriSpan(from: Iso, to: Iso, locale: string): string {
  const f = new Intl.DateTimeFormat(`${locale}-u-ca-islamic-umalqura`, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const a = f.format(new Date(`${from}T12:00:00Z`));
  const b = f.format(new Date(`${to}T12:00:00Z`));
  return a === b ? a : `${a} – ${b}`;
}

export function monthTitle(iso: Iso, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso.slice(0, 7)}-01T12:00:00Z`));
}

export function weekdayShort(
  iso: Iso,
  locale: string,
  width: 'short' | 'narrow' = 'short',
): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-US', {
    weekday: width,
    timeZone: 'UTC',
  }).format(new Date(`${iso}T12:00:00Z`));
}

export function longDate(iso: Iso, locale: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (locale === 'ar') {
    return new Intl.DateTimeFormat('ar', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(d);
  }
  const wd = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(d);
  const mo = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(d);
  return `${wd} ${d.getUTCDate()} ${mo} ${d.getUTCFullYear()}`;
}

// The kind → the prototype's chip colours. Procedures are statutory deadlines
// (red), requests are due dates the client is waiting on (amber), tasks are
// internal (outlined), events are bookings (grey). The prototype's Meeting /
// Interview / Portal appointment split needs an event TYPE nothing stores yet,
// so all events share one style and the legend says the rest are coming.
export const KIND_CHIP: Record<CalendarItem['kind'], string> = {
  gro: 'bg-status-critical/10 text-status-critical',
  request: 'bg-status-warning/10 text-status-warning',
  task: 'bg-transparent text-neutral-600 ring-1 ring-neutral-200 ring-inset',
  event: 'bg-neutral-100 text-neutral-800',
};

// The same kinds as solid dots, for the phone month grid: a 6px dot needs the full
// tone — the chips' 10% tints are invisible at that size (measured on a 375 grid).
export const KIND_DOT: Record<CalendarItem['kind'], string> = {
  gro: 'bg-status-critical',
  request: 'bg-status-warning',
  task: 'bg-neutral-400',
  event: 'bg-neutral-700',
};
