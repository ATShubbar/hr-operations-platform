import type { DocumentCategory } from '@hr/contracts';
import type { StaffRole } from '../../auth/public-api';

// Which consultancy-staff roles are alerted about a document's expiry (EXP-01).
// This mirrors the DOC-02 category→role write scope (document-policy) from the
// producing side: whoever MANAGES a category is who should hear it is expiring.
// Administrator + HR officer see everything; GRO owns government documents
// (ADR-013: CVs belong to HR now that recruiting is an HR officer's work).
// (Kept as its own map rather than reused across the module boundary — the two
// rules can diverge, and duplicated ownership of a rule is what ADR-003 bars,
// not a small, intentional parallel.)
const GOV_CATEGORIES: ReadonlySet<DocumentCategory> = new Set([
  'iqama',
  'passport',
  'visa',
  'gosi',
  'national_id',
]);

export function rolesForCategory(category: DocumentCategory): StaffRole[] {
  const base: StaffRole[] = ['administrator', 'hr_officer'];
  if (GOV_CATEGORIES.has(category)) return [...base, 'gro_officer'];
  return base; // cv, contract, other → Administrator/HR officer
}
