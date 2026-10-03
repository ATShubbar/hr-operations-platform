import type { GroProcessStatus, GroProcessType } from '@hr/contracts';

// The GRO process workflow as the web app presents it (GRO-02/03). Shared by the
// GRO screen and the Person record's Open work tab (DS-07) so the two can never
// offer different moves for the same process. The API validates authoritatively.

// Legal next statuses. Terminal states have none.
export const GRO_NEXT: Record<GroProcessStatus, readonly GroProcessStatus[]> = {
  not_started: ['in_progress', 'cancelled'],
  in_progress: ['submitted', 'cancelled'],
  submitted: ['approved', 'rejected', 'cancelled'],
  approved: ['completed', 'cancelled'],
  rejected: ['in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
};

// Types whose completion writes a resulting expiry back to the employee (GRO-03),
// so completing one must capture that date.
export const GRO_EXPIRY_TYPES: ReadonlySet<GroProcessType> = new Set([
  'iqama_issue',
  'iqama_renewal',
  'exit_reentry',
  'work_permit_renewal',
]);
