// The Audit trail's categories (DS-15, owner decision): a FIXED, documented
// mapping from an entry's record type (its `resource`) to the prototype's
// categories. The log stores no category of its own, so this map is editorial —
// it lives here, once, and the filter sends the matching resources to the API
// (`resources=`) so filtering happens on the server, across every page.
//
// Payroll has no record type of its own yet (salary changes are written as
// `employee` updates), so it maps to nothing and the screen says so rather than
// guessing which employee updates touched pay.

export const AUDIT_CATEGORIES = [
  'access',
  'permissions',
  'procedure',
  'request',
  'payroll',
  'data',
  'integration',
  'records',
] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

const BY_RESOURCE: Record<string, AuditCategory> = {
  // who can sign in, and how
  'auth-account': 'access',
  'client-user': 'access',
  'employee-user': 'access',
  // who may do what
  'staff-user': 'permissions',
  // government procedures
  'gro-process': 'procedure',
  // requests and the work they spawn
  request: 'request',
  task: 'request',
  // bulk extraction
  report: 'data',
  // outbound integrations
  'gcal-invitation': 'integration',
};

export function categoryOf(resource: string): AuditCategory {
  return BY_RESOURCE[resource] ?? 'records';
}

/**
 * How a category is asked of the API (the filter runs on the server, across
 * every page):
 *   · a named category is the record types it CLAIMS (`resources=`);
 *   · Records is everything NO category claims, so it is asked for as an
 *     exclusion (`notResources=`). AUDIT-08: it used to be a fixed list of
 *     types written when the screen was built, and every record type added
 *     since — dependants, sequences, leave, fees, invoices — silently dropped
 *     out of it. As an exclusion, a new type is a record until someone files
 *     it under another category here.
 * `null` means the category has nothing to filter on yet (Payroll).
 */
export function filterOf(
  category: AuditCategory,
): { resources: string[] } | { notResources: string[] } | null {
  if (category === 'records') return { notResources: Object.keys(BY_RESOURCE) };
  const claimed = Object.entries(BY_RESOURCE)
    .filter(([, c]) => c === category)
    .map(([r]) => r);
  return claimed.length > 0 ? { resources: claimed } : null;
}

// The category badge's tone: the prototype's soft colours. Decorative metadata
// (a Badge, not a StatusPill — UX-02's line), so plain neutral/brand-free hues.
export const CATEGORY_CLASS: Record<AuditCategory, string> = {
  access: 'bg-status-warning/10 text-status-warning',
  permissions: 'bg-status-critical/10 text-status-critical',
  procedure: 'bg-status-info/10 text-status-info',
  request: 'bg-status-info/10 text-status-info',
  payroll: 'bg-status-critical/10 text-status-critical',
  data: 'bg-status-warning/10 text-status-warning',
  integration: 'bg-neutral-100 text-neutral-700',
  records: 'bg-neutral-100 text-neutral-700',
};
