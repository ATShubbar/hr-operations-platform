import { defineRouting } from 'next-intl/routing';

// Locale set and default come from Configuration-level conventions
// (ADR-005): Arabic-first, English second. Adding a locale = add it here
// plus a message catalog — no component changes.
export const routing = defineRouting({
  locales: ['ar', 'en'],
  defaultLocale: 'ar',
});

export type Locale = (typeof routing.locales)[number];

// The layout direction for a locale. ADR-012 (pixel-exact fidelity to the
// People & Gro prototype): the layout is LEFT-TO-RIGHT in both languages — the
// owner chose the prototype's literal layout over a mirrored Arabic one. Arabic
// TEXT still runs right-to-left inside its own lines (Unicode bidi), and every
// string stays translated. This one function feeds both <html dir> and Base UI's
// DirectionProvider, so reversing the decision is this line:
//   return locale === 'ar' ? 'rtl' : 'ltr';
export function directionFor(_locale: string): 'rtl' | 'ltr' {
  return 'ltr';
}
