'use client';

import { useTranslations } from 'next-intl';

// Money on screen (BILL-02, ADR-020). The API and the database hold WHOLE
// HALALAS; these are the only places that turn them into riyals and back.

/** "9,700" or "9,700.50" — digits only, Latin numerals in both locales. */
export function halalasToText(halalas: number): string {
  const whole = halalas % 100 === 0;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(halalas / 100);
}

/** For an input's value: "9700" or "9700.50". Zero is an empty box. */
export function halalasToInput(halalas: number): string {
  if (!halalas) return '';
  return halalas % 100 === 0 ? String(halalas / 100) : (halalas / 100).toFixed(2);
}

/**
 * What someone typed as riyals → halalas. Accepts "9700", "9,700", "9700.5",
 * "9700.50". Returns null for anything else — including a third decimal place,
 * which would be rounding money without saying so. An empty box is 0.
 */
export function sarTextToHalalas(text: string): number | null {
  const clean = text.replace(/[,\s]/g, '');
  if (clean === '') return 0;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(clean)) return null;
  const [riyals, fraction = ''] = clean.split('.');
  return Number(riyals) * 100 + Number(fraction.padEnd(2, '0'));
}

/** "SAR 9,700" / «9,700 ر.س» */
export function useMoney(): (halalas: number) => string {
  const t = useTranslations('money');
  return (halalas) => t('sar', { amount: halalasToText(halalas) });
}
