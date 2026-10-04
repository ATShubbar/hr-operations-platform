import type { SelfRequestResponse } from '@hr/contracts';
import type { RequestModel as RequestRecord } from '../../../generated/prisma/models';

// An employee's OWN request as they see it (SS-05) — a whitelist: what they asked
// and where it stands. Priority, due date, assignee, requester and client ids
// are staff triage and stay out. THREAD-04 adds the type's published service
// level (a turnaround, not the due date).
export function toSelfRequestResponse(
  r: RequestRecord,
  serviceLevelDays: number | null,
): SelfRequestResponse {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    description: r.description,
    status: r.status,
    serviceLevelDays,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
