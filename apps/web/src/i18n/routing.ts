import { defineRouting } from 'next-intl/routing';

// Locale set and default come from Configuration-level conventions
// (ADR-005): Arabic-first, English second. Adding a locale = add it here
// plus a message catalog — no component changes.
export const routing = defineRouting({
  locales: ['ar', 'en'],
  defaultLocale: 'ar',
});

export type Locale = (typeof routing.locales)[number];

export function directionFor(locale: string): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}
