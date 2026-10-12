import { z } from 'zod';

// A comma-separated list of record types (1–50 of them).
const recordTypes = z
  .string()
  .min(1)
  .max(1000)
  .transform((v) =>
    v
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().min(1).max(100)).min(1).max(50));

// Audit read API (AUDIT-04). The query filters mirror the columns admins
// reason about; `limit`/`beforeId` are cursor pagination (newest-first).
export const auditQuerySchema = z.object({
  resource: z.string().min(1).max(100).optional(),
  action: z.string().min(1).max(100).optional(),
  actorId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  // DS-15: several record types at once (an Audit-trail category is a set of
  // them), comma-separated; and a case-insensitive text search over the action
  // and the record type, applied on the SERVER so it reaches every page.
  resources: recordTypes.optional(),
  // AUDIT-08: every record type EXCEPT these. The Audit trail's "Records"
  // category is "whatever no other category claims", so the screen sends the
  // other categories' types here — and a record type added later is included
  // without anyone remembering to list it.
  notResources: recordTypes.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  // AUDIT-07: how serious — derived from the record type + action (one rule table).
  severity: z.enum(['routine', 'notable', 'critical']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  // Cursor: return entries with id < beforeId. String because the id is a
  // BigInt (see auditEntrySchema.id) that must not lose precision.
  beforeId: z.string().regex(/^\d+$/).optional(),
});

export const auditEntrySchema = z.object({
  // BigInt primary key serialized as a decimal string (JSON has no BigInt).
  id: z.string(),
  actorId: z.uuid().nullable(),
  actorRole: z.string().nullable(),
  clientId: z.uuid().nullable(),
  resource: z.string(),
  // The record the entry is about (AUDIT-06; null for older entries and for
  // resources that do not record it). DS-15 shows it as the entry's target.
  resourceId: z.uuid().nullable(),
  action: z.string(),
  // AUDIT-07: derived, never stored — re-graded if the rule table changes.
  severity: z.enum(['routine', 'notable', 'critical']),
  before: z.unknown(),
  after: z.unknown(),
  requestId: z.string().nullable(),
  createdAt: z.string(), // ISO 8601
});

export const auditListResponseSchema = z.object({
  entries: z.array(auditEntrySchema),
  // id to pass as the next `beforeId`, or null when the page is the last one.
  nextCursor: z.string().nullable(),
});

// DS-15: the Audit trail's header figures. `from` is the start of "today" in the
// viewer's own time zone (defaults to UTC midnight).
export const auditSummaryQuerySchema = z.object({
  from: z.coerce.date().optional(),
});
export const auditSummaryResponseSchema = z.object({
  eventsToday: z.number().int(),
  actors: z.number().int(),
  // AUDIT-07: critical events since `from` — the Flagged-critical tile.
  critical: z.number().int(),
});

// AUDIT-09: who a set of actor ids are — for the Audit trail to name an actor
// the staff directory does not list (a client manager, an employee). `ids` is a
// comma-separated list, at most 100 (one page of the trail holds fewer).
export const AUDIT_ACTORS_MAX_IDS = 100;
export const auditActorsQuerySchema = z.object({
  ids: z
    .string()
    .min(1)
    .transform((v) => v.split(','))
    .pipe(z.array(z.uuid()).min(1).max(AUDIT_ACTORS_MAX_IDS)),
});
// The id and the display name — never the email, role or status. An account
// with no name comes back with `name: null`; an id that never acted, or whose
// account no longer exists, is simply absent.
export const auditActorsResponseSchema = z.object({
  actors: z.array(z.object({ id: z.uuid(), name: z.string().nullable() }).strict()),
});

// AUDIT-13: the accounts OUTSIDE the staff directory that appear in the trail —
// client managers and employees — so the Actor filter can offer them. The id,
// the display name and which kind of account; never the email.
export const auditNonStaffActorsResponseSchema = z.object({
  actors: z.array(
    z
      .object({ id: z.uuid(), name: z.string().nullable(), kind: z.enum(['client', 'employee']) })
      .strict(),
  ),
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;
export type AuditSummaryResponse = z.infer<typeof auditSummaryResponseSchema>;
export type AuditEntry = z.infer<typeof auditEntrySchema>;
export type AuditListResponse = z.infer<typeof auditListResponseSchema>;
export type AuditActorsResponse = z.infer<typeof auditActorsResponseSchema>;
export type AuditNonStaffActorsResponse = z.infer<typeof auditNonStaffActorsResponseSchema>;
