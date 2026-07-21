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
    await tx.auditEntry.create({
      data: {
        actorId: input.actorId ?? ctx?.actorId ?? null,
        actorRole: input.actorRole ?? ctx?.role ?? null,
        clientId: input.clientId ?? ctx?.clientId ?? null,
        resource: input.resource,
        action: input.action,
        before: input.before,
        after: input.after,
        requestId: ctx?.requestId ?? null,
      },
    });
  }
}
