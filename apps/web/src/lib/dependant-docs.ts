import type { DependantExpiry } from '@hr/contracts';
import { apiFetch } from '@/lib/api';
import { daysTo } from '@/lib/employee-docs';

// Dependants' dated documents (DEP-05a, ADR-017 rev. 1): iqama, medical
// insurance and passport — each dependant's own clock, renewed separately from
// the sponsor's. Read in one request from GET /dependants/expiries, which
// carries DATES ONLY (whose dependant, three dates): enough to count, and
// nothing that identifies a family member.
//
// Staff only. A client manager is refused by the API (a family is not the
// employer's business), so their screens never call this.

export const DEPENDANT_DOC_KEYS = ['iqama', 'insurance', 'passport'] as const;
export type DependantDocKey = (typeof DEPENDANT_DOC_KEYS)[number];

const DATE: Record<DependantDocKey, (d: DependantExpiry) => string | null> = {
  iqama: (d) => d.iqamaExpiry,
  insurance: (d) => d.insuranceExpiry,
  passport: (d) => d.passportExpiry,
};

export interface DependantDue {
  employeeId: string;
  key: DependantDocKey;
  iso: string;
  days: number;
}

/**
 * Every dated dependant document whose SPONSOR is one of the people given.
 * Each screen passes its own people — everyone under management on the
 * Overview, one company's register on a Client record — so dependants are
 * counted by the same rule as the employees shown beside them.
 */
export function dependantDocs(
  dependants: readonly DependantExpiry[],
  sponsors: ReadonlyArray<{ id: string }>,
): DependantDue[] {
  const ids = new Set(sponsors.map((s) => s.id));
  const out: DependantDue[] = [];
  for (const d of dependants) {
    if (!ids.has(d.employeeId)) continue;
    for (const key of DEPENDANT_DOC_KEYS) {
      const iso = DATE[key](d);
      if (iso) out.push({ employeeId: d.employeeId, key, iso, days: daysTo(iso) });
    }
  }
  return out;
}

/**
 * The dependants' expiry dates, or `null` when they could not be read — a
 * failed read must never look like "nobody has a dependant".
 */
export async function loadDependantExpiries(clientId?: string): Promise<DependantExpiry[] | null> {
  try {
    const q = clientId ? `?clientId=${clientId}` : '';
    return (await apiFetch<{ dependants: DependantExpiry[] }>(`/dependants/expiries${q}`))
      .dependants;
  } catch {
    return null;
  }
}
