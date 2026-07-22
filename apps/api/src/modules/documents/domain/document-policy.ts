import type { DocumentCategory } from '@hr/contracts';

// Category-scoped write authorization (DOC-02). The `document.upload` permission
// gates the endpoint; this narrows WHICH categories a role may create, per the
// architecture permission matrix — recruiter handles recruitment docs, GRO
// handles government docs, admin/HR handle everything. (The EMP-02 pattern:
// a coarse permission plus a finer, in-handler capability check.)

const GOV_CATEGORIES: ReadonlySet<DocumentCategory> = new Set([
  'iqama',
  'passport',
  'visa',
  'gosi',
  'national_id',
]);
const RECRUITMENT_CATEGORIES: ReadonlySet<DocumentCategory> = new Set(['cv']);

// Roles that hold document.upload and their category scope. Roles without
// document.upload never reach here (the guard rejects them first).
export function canWriteCategory(role: string | null | undefined, category: DocumentCategory): boolean {
  switch (role) {
    case 'company_admin':
    case 'hr_officer':
      return true; // full CRUD across all categories
    case 'recruiter':
      return RECRUITMENT_CATEGORIES.has(category);
    case 'gro_officer':
      return GOV_CATEGORIES.has(category);
    default:
      return false;
  }
}
