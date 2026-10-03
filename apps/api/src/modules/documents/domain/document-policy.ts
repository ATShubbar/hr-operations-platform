import type { DocumentCategory } from '@hr/contracts';

// Category-scoped write authorization (DOC-02). The `document.upload` permission
// gates the endpoint; this narrows WHICH categories a role may create, per the
// permission matrix (v1.7, ADR-013) — GRO handles government docs only,
// Administrator/HR officer handle everything. (The EMP-02 pattern: a coarse
// permission plus a finer, in-handler capability check.) The prototype does not
// model categories; keeping GRO's scope is ADR-013's narrower reading.

const GOV_CATEGORIES: ReadonlySet<DocumentCategory> = new Set([
  'iqama',
  'passport',
  'visa',
  'gosi',
  'national_id',
]);

// Roles that hold document.upload and their category scope. Roles without
// document.upload never reach here (the guard rejects them first).
export function canWriteCategory(role: string | null | undefined, category: DocumentCategory): boolean {
  switch (role) {
    case 'administrator':
    case 'hr_officer':
      return true; // full CRUD across all categories
    case 'gro_officer':
      return GOV_CATEGORIES.has(category);
    default:
      return false;
  }
}
