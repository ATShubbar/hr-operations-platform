import type { VacancyStatus } from '../../../generated/prisma/client';

// The vacancy status workflow (REC-02). Staff advance a vacancy along these edges
// only (gated by vacancy.approve); anything else is an illegal transition (400).
// `draft` is where a vacancy is prepared; `open` = actively recruiting; `filled`
// = position(s) taken; `closed`/`cancelled` are terminal.
const TRANSITIONS: Record<VacancyStatus, readonly VacancyStatus[]> = {
  draft: ['open', 'cancelled'],
  open: ['filled', 'closed', 'cancelled'],
  filled: ['closed'],
  closed: [],
  cancelled: [],
};

export function canTransition(from: VacancyStatus, to: VacancyStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
