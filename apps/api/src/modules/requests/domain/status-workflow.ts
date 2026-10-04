import type { RequestStatus } from '../../../generated/prisma/client';

// The request status workflow (REQ-03). Staff advance a request along these
// edges only; anything else is an illegal transition (400). `closed` and
// `cancelled` are terminal; `resolved` may reopen to `in_progress`.
// THREAD-03: `info_needed` ("Ask for more detail") from open or in progress;
// staff move it on by hand to open, in progress or cancelled — the requester's
// reply returns it automatically to where it was (requester-reply.ts).
const TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  open: ['in_progress', 'info_needed', 'cancelled'],
  in_progress: ['info_needed', 'resolved', 'cancelled'],
  info_needed: ['open', 'in_progress', 'cancelled'],
  resolved: ['closed', 'in_progress'],
  closed: [],
  cancelled: [],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
