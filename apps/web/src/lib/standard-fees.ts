'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_STANDARD_FEES, type StandardFees } from '@hr/contracts/billing-lists';
import { apiFetch } from '@/lib/api';

// The standard fees (BILL-02, ADR-020): what a filing dialog PREFILLS. They are
// a system setting the Administrator edits; every staff role may read them.
// Fetched once per page load and shared — several dialogs on one screen ask.
//
// Until they arrive (or if the read fails) the coded defaults stand in, so a
// dialog never waits on this: the person confirms the amount either way.

const KEY = 'billing.standard-fees';
let shared: Promise<StandardFees> | null = null;

function load(): Promise<StandardFees> {
  shared ??= apiFetch<{ settings: Record<string, unknown> }>('/config')
    .then((res) => (res.settings[KEY] as StandardFees | undefined) ?? DEFAULT_STANDARD_FEES)
    .catch(() => {
      shared = null; // try again next time rather than pinning the defaults
      return DEFAULT_STANDARD_FEES;
    });
  return shared;
}

/** Call after the setting is saved, so the next dialog prefills the new figure. */
export function forgetStandardFees(): void {
  shared = null;
}

export function useStandardFees(): StandardFees {
  const [fees, setFees] = useState<StandardFees>(DEFAULT_STANDARD_FEES);
  useEffect(() => {
    let live = true;
    void load().then((f) => live && setFees(f));
    return () => {
      live = false;
    };
  }, []);
  return fees;
}
