// Client-company domain input (CLIENT-01). The persistence shape is Prisma's
// Client model; this is the module's public create contract. Bilingual names
// per ADR-005; status is the lifecycle (active | inactive).
export interface CreateClientInput {
  nameAr: string;
  nameEn: string;
  status?: 'active' | 'inactive';
}
