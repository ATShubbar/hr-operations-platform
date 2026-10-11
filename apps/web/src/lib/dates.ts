// Dates and times for the screen (UX-21).
//
// The layout runs left to right in both languages (ADR-012). An Arabic date
// standing on its own opens with a number, and a leading number is placed at the
// LEFT: measured, "3 أكتوبر 2026" was drawn day, then year, then month. Every date
// and time the web app shows therefore goes through this file, which puts a
// right-to-left mark in front of an Arabic value (`rtlSafeValue`). English values
// come back untouched.
//
// `dateFormat` takes exactly what `Intl.DateTimeFormat` takes, so no date changes
// its wording — only the mark is added. The lint config forbids using
// `Intl.DateTimeFormat`, `formatHijri` or `formatGregorian` anywhere else in the
// web app, so a new screen cannot bring the fault back.
//
// The mark is for DISPLAY. A value used as a key, a file name or an input's value
// must be built from the raw date, not from here.
import { formatGregorian, formatHijri } from '@hr/dates';
import { rtlSafeValue } from '@hr/text';

type Formatter = Pick<Intl.DateTimeFormat, 'format' | 'formatToParts' | 'resolvedOptions'>;

/** A drop-in for `new Intl.DateTimeFormat(locales, options)`. */
export function dateFormat(
  locales?: Intl.LocalesArgument,
  options?: Intl.DateTimeFormatOptions,
): Formatter {
  const real = new Intl.DateTimeFormat(locales, options);
  return {
    format: (date) => rtlSafeValue(real.format(date)),
    formatToParts: (date) => real.formatToParts(date),
    resolvedOptions: () => real.resolvedOptions(),
  };
}

/** The Hijri (Umm al-Qura) date in words: "22 ربيع الآخر 1448 هـ". */
export function hijriDate(date: Date, locale: 'ar' | 'en' = 'ar'): string {
  return rtlSafeValue(formatHijri(date, locale));
}

/** The Gregorian date in words: "3 أكتوبر 2026". */
export function gregorianDate(date: Date, locale: 'ar' | 'en' = 'ar'): string {
  return rtlSafeValue(formatGregorian(date, locale));
}
