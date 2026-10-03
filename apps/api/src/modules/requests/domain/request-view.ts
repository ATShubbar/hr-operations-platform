import type { SelfRequestResponse } from '@hr/contracts';
import type { RequestModel as RequestRecord } from '../../../generated/prisma/models';

// An employee's OWN request as they see it (SS-05) — a whitelist: what they asked
// and where it stands. Priority, due date, assignee, requester and client ids
// are staff triage and stay out.
export function toSelfRequestResponse(r: RequestRecord): SelfRequestResponse {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    description: r.description,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
