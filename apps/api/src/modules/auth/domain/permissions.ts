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
  'scope-check.create',
  // Audit log read — admins only (permission matrix: System/Company Admin).
  'audit.read',
  // Client companies (permission matrix): all staff read; admins create/update/
  // archive. Client-rep "read own" (scoped) is granted when its endpoint lands.
  'client.read',
  'client.create',
  'client.update',
  'client.delete',
  // Client portal users (permission matrix): Client Admin manages its own
  // client's users (CRUD own). Client User has none of these.
  'client-user.read',
  'client-user.create',
  'client-user.update',
  'client-user.delete',
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

// Every staff role: example capability, session end, and reading client
// companies (matrix — all staff have R on client companies).
const ALL_STAFF: readonly Permission[] = ['example.read', 'session.end', 'client.read'];
// Admin-only staff superset: System/Company Admin additionally read audit logs
// and create/update/archive client companies (matrix — no other role has these).
const ADMIN_STAFF: readonly Permission[] = [
  ...ALL_STAFF,
  'audit.read',
  'client.create',
  'client.update',
  'client.delete',
];
// Both client roles: the scope-check exemplar + session end.
const ALL_CLIENT: readonly Permission[] = [
  'scope-check.read',
  'scope-check.create',
  'session.end',
];
// Client Admin additionally manages its own client's portal users (matrix —
// Client User does NOT).
const CLIENT_ADMIN: readonly Permission[] = [
  ...ALL_CLIENT,
  'client-user.read',
  'client-user.create',
  'client-user.update',
  'client-user.delete',
];

// Seeded from the architecture matrix. Client-scoped capabilities belong to
// client roles; staff cross-client access is granted per matrix row as real
// modules land.
export const ROLE_PERMISSIONS: Record<RoleName, readonly Permission[]> = {
  system_admin: ADMIN_STAFF,
  company_admin: ADMIN_STAFF,
  recruiter: ALL_STAFF,
  hr_officer: ALL_STAFF,
  gro_officer: ALL_STAFF,
  finance: ALL_STAFF,
  read_only: ALL_STAFF,
  client_admin: CLIENT_ADMIN,
  client_user: ALL_CLIENT,
};
