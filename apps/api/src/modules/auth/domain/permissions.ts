// Permission catalog + role mapping (AUTH-04, ADR-002).
//
// THE rules:
// - Permission names follow the frozen `resource.action` convention
//   (architecture.md → Permission naming convention).
// - Every `@RequirePermission` value in the codebase MUST be in PERMISSIONS
//   (enforced by the catalog-coverage spec — undeclared permissions fail CI).
// - Roles come from the architecture's permission matrix; granting happens
//   HERE, in data — never as role conditionals in handlers.

export const PERMISSIONS = [
  // Walking-skeleton exemplar capabilities. Real module permissions are
  // added here in the same commit as their endpoints.
  'example.read',
  'scope-check.read',
  // Session lifecycle — every authenticated principal may end their session.
  'session.end',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const STAFF_ROLES = [
  'system_admin',
  'company_admin',
  'recruiter',
  'hr_officer',
  'gro_officer',
  'finance',
  'read_only',
] as const;

export const CLIENT_ROLES = ['client_admin', 'client_user'] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];
export type ClientRole = (typeof CLIENT_ROLES)[number];
export type RoleName = StaffRole | ClientRole;

const ALL_STAFF: readonly Permission[] = ['example.read', 'session.end'];
const ALL_CLIENT: readonly Permission[] = ['scope-check.read', 'session.end'];

// Seeded from the architecture matrix. Client-scoped capabilities belong to
// client roles; staff cross-client access is granted per matrix row as real
// modules land.
export const ROLE_PERMISSIONS: Record<RoleName, readonly Permission[]> = {
  system_admin: ALL_STAFF,
  company_admin: ALL_STAFF,
  recruiter: ALL_STAFF,
  hr_officer: ALL_STAFF,
  gro_officer: ALL_STAFF,
  finance: ALL_STAFF,
  read_only: ALL_STAFF,
  client_admin: ALL_CLIENT,
  client_user: ALL_CLIENT,
};
