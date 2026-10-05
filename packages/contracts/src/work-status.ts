// When is a piece of work FINISHED? (CAL-04) — the ONE answer every screen uses:
// the calendar view and the reports (API), the work queue, both Overviews and the
// client figures (web). Before this each kept its own list and they disagreed —
// the calendar dropped a REJECTED procedure the queue still showed, and counted a
// RESOLVED request as due while the queue had it finished.
//
// Owner decisions (CAL-04): a rejected procedure is OPEN work (the workflow
// retries it: rejected → in_progress, or cancels it); a resolved request is
// FINISHED (the work is done; closing is a formality, and reopening makes it open
// again). Everything not listed here is open.
//
// No zod here on purpose: the web imports this through the `@hr/contracts/
// work-status` subpath, and importing the package root would ship zod to the
// browser (the DS-06 landmine).

export type WorkKind = 'task' | 'request' | 'procedure';

export const FINISHED: { readonly [K in WorkKind]: readonly string[] } = {
  task: ['done', 'cancelled'],
  request: ['resolved', 'closed', 'cancelled'],
  procedure: ['completed', 'cancelled'],
};

export function isFinished(kind: WorkKind, status: string): boolean {
  return FINISHED[kind].includes(status);
}
