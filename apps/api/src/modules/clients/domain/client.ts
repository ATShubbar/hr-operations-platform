// Client-company domain inputs (CLIENT-01/02). The persistence shape is
// Prisma's Client model; these are the module's create/update contracts.
// Bilingual names per ADR-005; status is the lifecycle (active | inactive).
export type ClientStatusValue = 'active' | 'inactive';

export interface CreateClientInput {
  nameAr: string;
  nameEn: string;
  status?: ClientStatusValue;
}

export interface UpdateClientInput {
  nameAr?: string;
  nameEn?: string;
  status?: ClientStatusValue;
}
