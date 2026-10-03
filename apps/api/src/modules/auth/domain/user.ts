// Identity domain types (AUTH-01). The persistence shape lives in Prisma's
// AuthUser; these are the module's public input contracts.

import type { ClientRole, StaffRole } from './permissions';

export interface CreateStaffUserInput {
  email: string;
  passwordHash: string;
  role: StaffRole;
}

// Employee self-service (ADR-011, SS-01). No role field — an employee account
// has exactly one possible role — and no clientId: the company is read from the
// employee record when needed, never stored on the account.
export interface CreateEmployeeUserInput {
  email: string;
  passwordHash: string;
  employeeId: string;
}

export interface CreateClientRepUserInput {
  email: string;
  passwordHash: string;
  clientId: string;
  role: ClientRole;
}
