import type { GroProcessStatus } from '../../../generated/prisma/client';

// The GRO process status workflow (GRO-02). Staff advance a process along these
// edges only (gated by gro.process); anything else is illegal (400). The happy
// path is not_started → in_progress → submitted → approved → completed; a
// submission may be rejected and retried (rejected → in_progress); any ACTIVE
// process may be cancelled. completed/cancelled are terminal.
const TRANSITIONS: Record<GroProcessStatus, readonly GroProcessStatus[]> = {
  not_started: ['in_progress', 'cancelled'],
  in_progress: ['submitted', 'cancelled'],
  submitted: ['approved', 'rejected', 'cancelled'],
  approved: ['completed', 'cancelled'],
  rejected: ['in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function canTransition(from: GroProcessStatus, to: GroProcessStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
