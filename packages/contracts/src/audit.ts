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
  action: z.string(),
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

export type AuditQuery = z.infer<typeof auditQuerySchema>;
export type AuditEntry = z.infer<typeof auditEntrySchema>;
export type AuditListResponse = z.infer<typeof auditListResponseSchema>;
