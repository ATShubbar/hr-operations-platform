import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { requestContext } from '../../../context/request-context';
import type { AuditRecordInput } from '../domain/audit-entry';

// Synchronous, transactional audit write (AUDIT-01; hardens ADR-004 for the
// audit case). The row is created INSIDE the caller's transaction, so the
// audit entry and the mutation it records commit or roll back together —
// there is no orphaned audit (mutation rolled back) and no missing audit
// (mutation committed). The caller owns the transaction and passes its
// handle; this service never opens one of its own.
@Injectable()
export class AuditService {
  async record(tx: Prisma.TransactionClient, input: AuditRecordInput): Promise<void> {
    const ctx = requestContext.get();
    const actorId = input.actorId ?? ctx?.actorId ?? null;
    const actorRole = input.actorRole ?? ctx?.role ?? null;
    const clientId = input.clientId ?? ctx?.clientId ?? null;
    const requestId = ctx?.requestId ?? null;
    const before = input.before === undefined ? null : JSON.stringify(input.before);
    const after = input.after === undefined ? null : JSON.stringify(input.after);

    // Raw INSERT WITHOUT RETURNING on purpose: the client-rep DB role
    // (app_client) has INSERT but no SELECT on aud_entries, and RETURNING
    // requires SELECT (AUDIT-02 finding). A no-RETURNING insert works for both
    // the staff and client-rep paths, so audit logging is uniform regardless
    // of which role owns the caller's transaction.
    await tx.$executeRaw`
      INSERT INTO aud_entries
        (actor_id, actor_role, client_id, resource, action, "before", "after", request_id)
      VALUES
        (${actorId}::uuid, ${actorRole}, ${clientId}::uuid, ${input.resource},
         ${input.action}, ${before}::jsonb, ${after}::jsonb, ${requestId})
    `;
  }
}
