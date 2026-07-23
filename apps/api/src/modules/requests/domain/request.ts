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

// Editable fields (REQ-02). Status is NOT here — advancing it is the processing
// concern (request.process, REQ-03). Every field is optional (partial update);
// `description`/`dueDate` accept null to clear.
export interface UpdateRequestInput {
  title?: string;
  description?: string | null;
  priority?: RequestPriority;
  dueDate?: Date | null;
}
