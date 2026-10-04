import type { Prisma } from '../../../generated/prisma/client';
import type { RequestModel as RequestRecord } from '../../../generated/prisma/models';
import type { AuditService } from '../../audit/public-api';

type Tx = Prisma.TransactionClient;

// THREAD-03 (ADR-016 rev. 2): the requester's side answered a request that was
// waiting on them — a comment, or a file that passed its checks, from the client
// manager or the employee who raised it. In the SAME transaction as that reply
// (on the replier's own fenced connection) the request goes back to where it was
// when the detail was asked: open, or in progress with its assignee. Staff
// replies never call this. The database lets the client and employee roles make
// exactly this move and no other (req_requests_info_guard).
//
// Returns what the wait looked like (its due date and when it began) so the
// caller can pause the service-level clock AFTER the commit (THREAD-04 — the
// due date is the system's to move, on the staff connection); null if nothing
// was waiting.
export async function returnIfWaiting(
  tx: Tx,
  audit: AuditService,
  request: RequestRecord,
): Promise<{ dueDate: Date | null; since: Date | null } | null> {
  if (request.status !== 'info_needed' || !request.infoReturnsTo) return null;
  const moved = await tx.request.updateMany({
    where: { id: request.id, status: 'info_needed' },
    data: { status: request.infoReturnsTo, infoReturnsTo: null, infoNeededSince: null },
  });
  if (moved.count !== 1) return null; // staff moved it on meanwhile — nothing to return
  await audit.record(tx, {
    resource: 'request',
    resourceId: request.id,
    action: 'info-returned',
    clientId: request.clientId,
    before: { status: 'info_needed' },
    after: { status: request.infoReturnsTo },
  });
  return { dueDate: request.dueDate, since: request.infoNeededSince };
}
