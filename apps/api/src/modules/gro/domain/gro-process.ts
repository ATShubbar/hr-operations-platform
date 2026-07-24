import type { GroProcessType } from '../../../generated/prisma/client';

// Input to GroProcessesService.create (GRO-01). A process always starts
// `not_started` — advancing it through the workflow is the GRO-02 concern, so
// `status` is not accepted here. `createdByUserId` comes from the request context
// via the caller, never input.
export interface CreateGroProcessInput {
  clientId: string;
  employeeId: string;
  type: GroProcessType;
  referenceNumber?: string | null;
  dueDate?: Date | null;
  assigneeUserId?: string | null;
  notes?: string | null;
  createdByUserId?: string | null;
}

// Editable core fields (GRO-02). Status is NOT here — advancing it is the workflow
// concern (gro.process). Every field optional (partial update); nullable fields
// accept null to clear.
export interface UpdateGroProcessInput {
  referenceNumber?: string | null;
  dueDate?: Date | null;
  assigneeUserId?: string | null;
  notes?: string | null;
}
