import type { DependantResponse, SelfDependant } from '@hr/contracts';
import type { DependantModel as DependantRecord } from '../../../generated/prisma/models';

// The dependant read views (DEP-02, ADR-017) — WHITELISTS, field by field, so a
// column added to the table never reaches a response by default. Removal stamps
// and timestamps are never shown; removed rows never reach a mapper.

const day = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

const common = (d: DependantRecord) => ({
  id: d.id,
  relationship: d.relationship,
  nameEn: d.nameEn,
  nameAr: d.nameAr,
  dateOfBirth: day(d.dateOfBirth),
  iqamaExpiry: day(d.iqamaExpiry),
  passportExpiry: day(d.passportExpiry),
  insuranceExpiry: day(d.insuranceExpiry),
});

/** Staff: the iqama number only for govdata.read holders — and the response says when it is withheld. */
export function toDependantResponse(
  d: DependantRecord,
  identifierVisible: boolean,
): DependantResponse {
  return {
    ...common(d),
    employeeId: d.employeeId,
    iqamaNumber: identifierVisible ? d.iqamaNumber : null,
    identifierVisible,
  };
}

/** The employee's own family (ADR-011: one's own identifiers, with numbers). No sponsor id. */
export function toSelfDependant(d: DependantRecord): SelfDependant {
  return { ...common(d), iqamaNumber: d.iqamaNumber };
}
