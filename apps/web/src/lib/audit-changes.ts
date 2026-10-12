// What an audit entry changed, in words (AUDIT-12, ADR-022).
//
// The API records field KEYS and raw values (AUDIT-11): `employmentStatus`,
// `on_leave`, `2027-03-03`, an account id. This turns them into what a person
// reads — "Employment status", "On leave", "3 Mar 2027", a name — in either
// language. One place, used by the Audit trail's rows and entry window and by a
// person's History.
//
// Pure: everything it needs from the screen (messages, names, date and money
// formatting) is handed in as a `ChangeFormat`, so it can be reasoned about
// without a component.
//
// A key or value nobody has translated still shows: the key as plain words, the
// value as recorded. A new field degrades, it never disappears.

export interface Change {
  key: string;
  before: unknown;
  after: unknown;
  /** Whether the entry has an earlier side / a later side for this field. */
  had: boolean;
  has: boolean;
}

export interface ChangeFormat {
  locale: 'ar' | 'en';
  /** A message by its path ("employees.status.active"), when there is one. */
  text: (path: string) => string | undefined;
  userName: (id: string) => string | null;
  clientName: (id: string) => string | null;
  nationality: (code: string) => string;
  day: (day: string) => string;
  hijri: (day: string) => string;
  instant: (iso: string) => string;
  money: (halalas: number) => string;
}

type Snapshot = Record<string, unknown> | null;
const asObject = (v: unknown): Snapshot =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

// In the entry so the record can be found, never something a person changed.
const PLUMBING = new Set(['dependantId', 'sequenceId', 'changed']);

/**
 * The fields an entry is about. With both sides: those whose value differs.
 * With one side (a record created, or removed): every field it holds.
 */
export function changesOf(before: unknown, after: unknown): Change[] {
  const b = asObject(before);
  const a = asObject(after);
  const keys = [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].filter(
    (k) => !PLUMBING.has(k),
  );
  return keys
    .filter((k) => !a || !b || JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null))
    .map((k) => ({
      key: k,
      before: b?.[k],
      after: a?.[k],
      had: b !== null,
      has: a !== null,
    }));
}

/** "jobTitleEn" → "Job title en" — the fallback for a key with no translation. */
function plainWords(key: string): string {
  const words = key
    .replace(/[-_.]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function fieldLabel(f: ChangeFormat, resource: string, key: string): string {
  return f.text(`auditField.${resource}.${key}`) ?? f.text(`auditField.${key}`) ?? plainWords(key);
}

// Where a field's values are already translated. A string is a label map for
// every record; an object picks the map by the kind of record.
const VALUE_LABELS: Record<string, string | Record<string, string>> = {
  employmentStatus: 'employees.status',
  contractType: 'employees.contract',
  gender: 'employees.gender',
  gosiContributionBasis: 'employees.gosiBasis',
  wpsStatus: 'employees.wps',
  exitReentryStatus: 'employees.exitReentry',
  gosiRegistrationStatus: 'employees.gosiReg',
  priority: 'requests.priority',
  infoReturnsTo: 'requests.status',
  relationship: 'person.family.relationship',
  role: 'roles',
  city: 'clientProfile.city',
  sector: 'clientProfile.sector',
  nitaqatBand: 'clientProfile.band',
  serviceTier: 'clientProfile.tier',
  responseCommitment: 'clientProfile.commitment',
  portals: 'clientProfile.portal',
  authority: 'fees.authorityName',
  cycle: 'clients.commercial.cycle',
  stage: 'hiring.column',
  procedureType: 'gro.type',
  status: {
    request: 'requests.status',
    task: 'tasks.status',
    'gro-process': 'gro.status',
    leave: 'leaves.status',
    vacancy: 'hiring.roleStatus',
    client: 'portal.company.statusValue',
    employee: 'employees.status',
    'staff-user': 'staffUsers.status',
    'client-user': 'staffUsers.status',
    'employee-user': 'selfServiceAccess.statusValue',
    fee: 'clients.fees.status',
    invoice: 'clients.commercial.inv.status',
  },
  type: {
    request: 'requests.type',
    'gro-process': 'gro.type',
    leave: 'leaves.type',
  },
};

// Pay amounts: plain numbers in the person's own currency (the entry does not
// say which, so no currency is claimed).
const AMOUNTS = new Set([
  'basicSalary',
  'housingAllowance',
  'transportAllowance',
  'otherAllowances',
  'gosiWage',
]);

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const EMPTY = '—';

function labelled(f: ChangeFormat, resource: string, key: string, value: string): string {
  const where = VALUE_LABELS[key];
  const map = typeof where === 'string' ? where : where?.[resource];
  return (map && f.text(`${map}.${value}`)) ?? value;
}

function listOf(f: ChangeFormat, resource: string, key: string, items: unknown[]): string {
  if (items.length === 0) return EMPTY;
  const comma = f.locale === 'ar' ? '، ' : ', ';
  return items
    .map((item) => {
      if (typeof item === 'string') return labelled(f, resource, key, item);
      const o = asObject(item);
      // A signatory: a name and a role.
      if (o && typeof o.name === 'string') {
        return typeof o.role === 'string' && o.role ? `${o.name} (${o.role})` : o.name;
      }
      return JSON.stringify(item);
    })
    .join(comma);
}

/**
 * A recorded value as a person reads it. `full` adds the Hijri date beside a
 * day — for the entry window and History; a row summary keeps it short.
 */
export function fieldValue(
  f: ChangeFormat,
  resource: string,
  key: string,
  value: unknown,
  full = false,
): string {
  if (value === null || value === undefined || value === '') return EMPTY;
  if (typeof value === 'boolean')
    return f.text(`auditChange.${value ? 'yes' : 'no'}`) ?? String(value);
  if (typeof value === 'number') {
    if (key.endsWith('Halalas')) return f.money(value);
    if (AMOUNTS.has(key)) return new Intl.NumberFormat('en-US').format(value);
    return String(value);
  }
  if (Array.isArray(value)) return listOf(f, resource, key, value);
  if (typeof value === 'object') return JSON.stringify(value);

  const text = String(value);
  if (DAY.test(text)) return full ? `${f.day(text)} (${f.hijri(text)})` : f.day(text);
  if (INSTANT.test(text)) return f.instant(text);
  if (key === 'nationality') return f.nationality(text);
  if (UUID.test(text)) {
    if (key === 'clientId') return f.clientName(text) ?? `#${text.slice(0, 8)}`;
    if (key === 'userId' || key.endsWith('UserId'))
      return f.userName(text) ?? `#${text.slice(0, 8)}`;
    return `#${text.slice(0, 8)}`;
  }
  return labelled(f, resource, key, text);
}
