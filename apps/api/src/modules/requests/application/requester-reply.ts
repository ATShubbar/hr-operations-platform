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
export async function returnIfWaiting(
  tx: Tx,
  audit: AuditService,
  request: RequestRecord,
): Promise<void> {
  if (request.status !== 'info_needed' || !request.infoReturnsTo) return;
  const moved = await tx.request.updateMany({
    where: { id: request.id, status: 'info_needed' },
    data: { status: request.infoReturnsTo, infoReturnsTo: null },
  });
  if (moved.count !== 1) return; // staff moved it on meanwhile — nothing to return
  await audit.record(tx, {
    resource: 'request',
    resourceId: request.id,
    action: 'info-returned',
    clientId: request.clientId,
    before: { status: 'info_needed' },
    after: { status: request.infoReturnsTo },
  });
}
