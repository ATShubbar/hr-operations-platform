import type { HistoryWithheld } from '@hr/contracts';
import { GOVDATA_FIELDS, SALARY_FIELDS } from '../../employees/public-api';

// What of an audit entry a reader of a person's History may see (HIST-01,
// ADR-022). The trail records every changed field with its values; History is
// read by every staff role, so each entry is cut down to what THIS reader could
// already see on the record:
//
//   - pay fields need `salary.read`;
//   - the government-data fields need `govdata.read` — numbers AND dates, as on
//     the record itself, where a staff reader sees that group whole or not at
//     all; a dependant keeps everything but the iqama number, as on the Family
//     tab;
//   - a self-service account's details need `employee-user.read`;
//   - a document's, a procedure's or a sequence's need the permission that
//     reads it.
//
// A reader without the permission still gets the entry — that it happened, who
// did it, when — and `withheld` says which kind of detail was left out.

type Side = Record<string, unknown> | null;
type Can = (permission: string) => boolean;

const asSide = (value: unknown): Side =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

// The permission that reads a whole record of each kind.
const READS: Record<string, string> = {
  employee: 'employee.read',
  dependant: 'employee.read',
  document: 'document.read',
  'gro-process': 'gro.read',
  'gro-sequence': 'gro.read',
};

// In the entry so the record can be found; never a detail for a reader.
const LOCATORS = new Set(['dependantId', 'sequenceId']);

const PAY = new Set<string>(SALARY_FIELDS);
const IDS = new Set<string>(GOVDATA_FIELDS);

export function detailsFor(
  entry: { resource: string; before: unknown; after: unknown },
  can: Can,
): { before: Side; after: Side; withheld: HistoryWithheld[] } {
  const before = asSide(entry.before);
  const after = asSide(entry.after);
  const none = (kind: HistoryWithheld) => ({ before: null, after: null, withheld: [kind] });

  if (entry.resource === 'employee-user') {
    return can('employee-user.read') ? { before, after, withheld: [] } : none('account');
  }
  const reads = READS[entry.resource];
  // A kind of record nobody has decided about shows no details — never all of them.
  if (!reads || !can(reads)) return none('record');

  const hidden = new Map<string, HistoryWithheld>();
  if (entry.resource === 'employee') {
    if (!can('salary.read')) for (const f of PAY) hidden.set(f, 'pay');
    if (!can('govdata.read')) for (const f of IDS) hidden.set(f, 'ids');
  }
  if (entry.resource === 'dependant' && !can('govdata.read')) hidden.set('iqamaNumber', 'ids');

  const withheld = new Set<HistoryWithheld>();
  const cut = (side: Side): Side => {
    if (!side) return null;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(side)) {
      if (LOCATORS.has(key)) continue;
      const kind = hidden.get(key);
      if (kind) withheld.add(kind);
      else out[key] = value;
    }
    return out;
  };
  return { before: cut(before), after: cut(after), withheld: [...withheld] };
}
