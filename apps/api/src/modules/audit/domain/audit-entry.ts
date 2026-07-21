// Audit write contract (AUDIT-01). The persistence shape is Prisma's
// AuditEntry; this is the module's public input type.
import type { Prisma } from '../../../generated/prisma/client';

export interface AuditRecordInput {
  // What was touched and how, e.g. resource 'scope-check', action 'create'.
  resource: string;
  action: string;
  // Prior/next state snapshots. Omit either side when it does not apply
  // (create has no before; delete has no after).
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  // Actor/scope default to the request context; pass explicitly only for
  // system-originated writes (jobs, seeds) that run outside a request.
  actorId?: string | null;
  actorRole?: string | null;
  clientId?: string | null;
}
