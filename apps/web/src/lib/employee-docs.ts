import type { EmployeeResponse } from '@hr/contracts';

// An employee's dated documents, read from the employee RECORD (DS-05): iqama,
// work permit and passport from government data, the contract from its end date.
// The prototype's insurance and driving licence are not stored yet — listed so
// screens can show them "soon", with no date.
//
// Extracted in DS-10 when the Client record became the second screen to judge
// people by their documents (People is the first); one copy keeps the two from
// disagreeing about who is expiring.

export type DocKey = 'iqama' | 'permit' | 'contract' | 'passport' | 'insurance' | 'licence';

export const DOC_TYPES: ReadonlyArray<{
  key: DocKey;
  date?: (e: EmployeeResponse) => string | null;
}> = [
  { key: 'iqama', date: (e) => e.govdata?.iqamaExpiry ?? null },
  { key: 'permit', date: (e) => e.govdata?.workPermitExpiry ?? null },
  { key: 'contract', date: (e) => e.contractEndDate },
  { key: 'passport', date: (e) => e.govdata?.passportExpiry ?? null },
  { key: 'insurance' }, // not stored yet
  { key: 'licence' }, // not stored yet
];

export interface DocDue {
  key: DocKey;
  iso: string;
  days: number;
}

// Whole days from today (UTC) to a stored date. Storage is Gregorian UTC.
export function daysTo(iso: string): number {
  const target = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}

export const isSaudi = (e: EmployeeResponse) => e.nationality.toUpperCase() === 'SA';

export function datedDocs(e: EmployeeResponse): DocDue[] {
  const out: DocDue[] = [];
  for (const d of DOC_TYPES) {
    // A Saudi has no iqama or work permit (the National ID does not expire).
    if (isSaudi(e) && (d.key === 'iqama' || d.key === 'permit')) continue;
    const iso = d.date?.(e);
    if (iso) out.push({ key: d.key, iso, days: daysTo(iso) });
  }
  return out;
}

/** The document that expires first, or null. */
export function soonestDoc(e: EmployeeResponse): DocDue | null {
  return datedDocs(e).sort((a, b) => a.days - b.days)[0] ?? null;
}

// The prototype's chip scale: overdue or ≤7d red, ≤14d amber, ≤30d grey, later
// faded. Colour is never alone — the chip always carries its day count.
export function chipClass(days: number): string {
  if (days <= 7) return 'bg-status-critical-surface text-status-critical';
  if (days <= 14) return 'bg-status-warning-surface text-status-warning';
  if (days <= 30) return 'bg-neutral-100 text-neutral-700';
  return 'bg-transparent text-neutral-400';
}
