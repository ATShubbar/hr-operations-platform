'use client';

import { useMemo } from 'react';

// The nationalities a picker offers (ISO 3166-1 alpha-2, what the API stores) —
// the workforce's common ones. Extracted in DS-09 when Hiring became the third
// screen to need the list; the People screen and the Person record share it.
export const NATIONALITIES = ['SA', 'IN', 'PK', 'EG', 'PH', 'BD', 'JO', 'SD', 'NP', 'LK'] as const;

/** A country code → its name in the UI locale, falling back to the code. */
export function useNationalityName(locale: string) {
  const names = useMemo(() => new Intl.DisplayNames([locale], { type: 'region' }), [locale]);
  return (code: string | null | undefined) => {
    if (!code) return '';
    try {
      return names.of(code.toUpperCase()) ?? code;
    } catch {
      return code;
    }
  };
}
