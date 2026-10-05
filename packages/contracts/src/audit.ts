import { z } from 'zod';

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
  resources: z
    .string()
    .min(1)
    .max(1000)
    .transform((v) =>
      v
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().min(1).max(100)).min(1).max(50))
    .optional(),
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

export type AuditQuery = z.infer<typeof auditQuerySchema>;
export type AuditSummaryResponse = z.infer<typeof auditSummaryResponseSchema>;
export type AuditEntry = z.infer<typeof auditEntrySchema>;
export type AuditListResponse = z.infer<typeof auditListResponseSchema>;
