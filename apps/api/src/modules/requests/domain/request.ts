import type { RequestPriority, RequestType } from '../../../generated/prisma/client';

// Input to RequestsService.create (REQ-01). `status` is not accepted here — a new
// request always starts `open`; advancing it is the processing concern (REQ-03).
// `createdByUserId` is taken from the request context by the caller, never input.
export interface CreateRequestInput {
  clientId: string;
  type: RequestType;
  title: string;
  description?: string | null;
  priority?: RequestPriority;
  dueDate?: Date | null;
  createdByUserId: string;
}
