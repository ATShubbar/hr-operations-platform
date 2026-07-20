// Identity domain types (AUTH-01). The persistence shape lives in Prisma's
// AuthUser; these are the module's public input contracts.

import type { ClientRole, StaffRole } from './permissions';

export interface CreateStaffUserInput {
  email: string;
  passwordHash: string;
  role: StaffRole;
}

export interface CreateClientRepUserInput {
  email: string;
  passwordHash: string;
  clientId: string;
  role: ClientRole;
}
