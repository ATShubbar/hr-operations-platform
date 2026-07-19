// Dual-calendar utility (ADR-005 invariant). THE rule: storage is always
// Gregorian UTC; Hijri (Umm al-Qura) is a render/input concern handled here
// and nowhere else. Uses the ICU islamic-umalqura calendar built into Node
// and all modern browsers — no third-party dependency.

const DAY_MS = 86_400_000;

export interface HijriParts {
  year: number;
  month: number; // 1-12 (1 = Muharram)
  day: number;
}

const partsFormatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  timeZone: 'UTC',
});

export function hijriParts(date: Date): HijriParts {
  const parts = partsFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? Number.NaN);
  return { year: get('year'), month: get('month'), day: get('day') };
}

export function formatHijri(date: Date, locale: 'ar' | 'en' = 'ar'): string {
  return new Intl.DateTimeFormat(`${locale}-u-ca-islamic-umalqura`, {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

export function formatGregorian(date: Date, locale: 'ar' | 'en' = 'ar'): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

// Hijri -> Gregorian (Intl cannot parse, so: approximate, then correct by
// comparing against hijriParts until exact). Returns noon UTC of the day so
// downstream date-only usage is timezone-shift safe.
export function gregorianFromHijri(year: number, month: number, day: number): Date {
  if (month < 1 || month > 12 || day < 1 || day > 30) {
    throw new RangeError(`Invalid Hijri date ${year}-${month}-${day}`);
  }
  const HIJRI_EPOCH_UTC = Date.UTC(622, 6, 19, 12); // approximate epoch; corrected below
  const approxDays = Math.floor((year - 1) * 354.36707 + (month - 1) * 29.5306 + (day - 1));
  let t = HIJRI_EPOCH_UTC + approxDays * DAY_MS;

  for (let i = 0; i < 100; i++) {
    const p = hijriParts(new Date(t));
    if (p.year === year && p.month === month && p.day === day) return new Date(t);
    const diffDays =
      (year - p.year) * 354.36707 + (month - p.month) * 29.5306 + (day - p.day);
    const step = Math.abs(diffDays) >= 1 ? Math.round(diffDays) : Math.sign(diffDays);
    t += step * DAY_MS;
  }
  throw new RangeError(
    `Hijri date ${year}-${month}-${day} does not exist in the Umm al-Qura calendar`,
  );
}
