import type { Prisma } from '../../../generated/prisma/client';

// How serious an audit event is (AUDIT-07) — DERIVED from what happened (record
// type + action), never stored, so changing a row here re-grades the whole trail.
// The owner approved this table; anything not listed is routine. A rule without
// an action covers every action on that record type.
export type Severity = 'routine' | 'notable' | 'critical';

interface Rule {
  resource: string;
  action?: string;
  severity: Exclude<Severity, 'routine'>;
}

const RULES: readonly Rule[] = [
  // Critical — who can get in and with what power, how the system behaves, the
  // things that can't be undone, a file stopped by the virus check, and taking
  // a copy of the trail itself.
  { resource: 'staff-user', severity: 'critical' },
  { resource: 'client-user', severity: 'critical' },
  { resource: 'employee-user', severity: 'critical' },
  { resource: 'config', action: 'system-set', severity: 'critical' },
  { resource: 'config', action: 'client-set', severity: 'critical' },
  { resource: 'config', action: 'client-clear', severity: 'critical' },
  { resource: 'document', action: 'legal-hold', severity: 'critical' },
  { resource: 'document', action: 'quarantine', severity: 'critical' },
  { resource: 'employee', action: 'delete', severity: 'critical' },
  { resource: 'audit', action: 'export', severity: 'critical' },
  // Notable — pay and government IDs, decisions on requests and leave, deletes
  // of sensitive records, data leaving the system, ID-number lookups.
  { resource: 'salary', action: 'update', severity: 'notable' },
  { resource: 'govdata', action: 'update', severity: 'notable' },
  // DEP-01 (ADR-017): a dependant carries an iqama number — graded like govdata.
  { resource: 'dependant', severity: 'notable' },
  // BILL-01 (ADR-020): money. Recording or correcting a fee is notable; a void
  // takes an amount out of what is owed, so it is what a reviewer reads first.
  { resource: 'fee', action: 'void', severity: 'critical' },
  { resource: 'fee', severity: 'notable' },
  // BILL-04: what a client is charged changed.
  { resource: 'billing-terms', severity: 'notable' },
  // BILL-05: an invoice record. Removing one takes an amount out of what a
  // client is shown to owe — the act a reviewer reads first.
  { resource: 'invoice', action: 'remove', severity: 'critical' },
  { resource: 'invoice', severity: 'notable' },
  { resource: 'request', action: 'process', severity: 'notable' },
  { resource: 'leave', action: 'approve', severity: 'notable' },
  { resource: 'leave', action: 'decline', severity: 'notable' },
  { resource: 'leave', action: 'file', severity: 'notable' },
  { resource: 'client', action: 'delete', severity: 'notable' },
  { resource: 'client', action: 'archive', severity: 'notable' },
  { resource: 'document', action: 'delete', severity: 'notable' },
  { resource: 'candidate', action: 'delete', severity: 'notable' },
  { resource: 'report', action: 'export', severity: 'notable' },
  // SOON-01: the People list leaving as a file.
  { resource: 'employee', action: 'export', severity: 'notable' },
  { resource: 'search', action: 'identifier-lookup', severity: 'notable' },
  { resource: 'leave-balance', action: 'carry-over', severity: 'notable' },
];

export function severityOf(resource: string, action: string): Severity {
  return (
    RULES.find((r) => r.resource === resource && (r.action === undefined || r.action === action))?.severity ??
    'routine'
  );
}

/** The database condition for one severity — so the list and the export filter on the SERVER. */
export function whereSeverity(severity: Severity): Prisma.AuditEntryWhereInput {
  const match = (rules: readonly Rule[]): Prisma.AuditEntryWhereInput[] =>
    rules.map((r) => ({ resource: r.resource, ...(r.action ? { action: r.action } : {}) }));
  if (severity === 'routine') return { NOT: { OR: match(RULES) } };
  // A critical rule wins over a notable one for the same pair (none overlap today).
  const critical = RULES.filter((r) => r.severity === 'critical');
  if (severity === 'critical') return { OR: match(critical) };
  return { AND: [{ OR: match(RULES.filter((r) => r.severity === 'notable')) }, { NOT: { OR: match(critical) } }] };
}
