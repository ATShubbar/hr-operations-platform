import type { RequestStatus } from '../../../generated/prisma/client';

// The request status workflow (REQ-03). Staff advance a request along these
// edges only; anything else is an illegal transition (400). `closed` and
// `cancelled` are terminal; `resolved` may reopen to `in_progress`.
const TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  open: ['in_progress', 'cancelled'],
  in_progress: ['resolved', 'cancelled'],
  resolved: ['closed', 'in_progress'],
  closed: [],
  cancelled: [],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
