// Dependants (DEP-01, ADR-017): what a caller may set on a dependant. The
// sponsor comes from the path, never the body; removal has its own operation.
export type DependantRelationship = 'spouse' | 'son' | 'daughter';

export interface DependantInput {
  relationship: DependantRelationship;
  nameEn: string;
  nameAr?: string | null;
  dateOfBirth?: Date | null;
  iqamaNumber?: string | null;
  iqamaExpiry?: Date | null;
  passportExpiry?: Date | null;
  insuranceExpiry?: Date | null;
}

export type DependantPatch = Partial<DependantInput>;
