// Identity domain types (AUTH-01). The persistence shape lives in Prisma's
// AuthUser; these are the module's public input contracts.

export interface CreateStaffUserInput {
  email: string;
  passwordHash: string;
}

export interface CreateClientRepUserInput {
  email: string;
  passwordHash: string;
  clientId: string;
}
