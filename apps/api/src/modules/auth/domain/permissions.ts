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
  // Employees (permission matrix) — three independently-grantable groups:
  // core profile, salary/financial, government data (each its own resource so
  // field-level sensitivity is enforced separately — EMP-02).
  'employee.read',
  'employee.create',
  'employee.update',
  'employee.delete',
  'salary.read',
  'salary.update',
  'govdata.read',
  'govdata.update',
  // Documents (DOC-02/03; permission matrix): all staff read; CRUD roles upload
  // and delete (category scope — recruiter → recruitment, GRO → gov, admin/HR →
  // all — is a finer in-handler check on upload + delete).
  'document.read',
  'document.upload',
  'document.delete',
  // Configuration (CONF-01/02; permission matrix): all staff read effective
  // settings + catalog; only System Admin writes the SYSTEM level (deployment-
  // wide defaults); Company Admin writes PER-CLIENT overrides (never the client
  // themselves). Per-user write lands with CONF-03.
  'config.read',
  'config.write',
  'config.write-client',
  // Per-user preferences (CONF-03): every authenticated principal manages their
  // OWN preferences (ui.language, …) — resolved user → client → system.
  'config.read-self',
  'config.write-self',
  // Notifications (NOTIF-02): every authenticated principal reads + marks read
  // their OWN in-app notifications. Preference management is notification-pref.* (NOTIF-04).
  'notification.read',
  // Document-expiry engine (EXP-02): admins may trigger the system-wide scan on
  // demand (POST /expiry/scan). The automatic daily run is scheduled, not a
  // permissioned route.
  'expiry.run',
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

// Every staff role: example capability, session end, reading client companies,
// reading the employee core profile, and reading configuration (all staff read
// effective settings — matrix).
const STAFF_BASE: readonly Permission[] = [
  'example.read',
  'session.end',
  'client.read',
  'employee.read',
  'config.read',
  'config.read-self',
  'config.write-self',
  'document.read',
  'notification.read',
];
// System/Company Admin extra: audit read + client CRUD (matrix) + triggering
// the document-expiry scan on demand (EXP-02).
const ADMIN_EXTRA: readonly Permission[] = [
  'audit.read',
  'client.create',
  'client.update',
  'client.delete',
  'expiry.run',
];
// Both client roles: the scope-check exemplar + session end + managing their
// own per-user preferences (CONF-03 — every authenticated principal).
const ALL_CLIENT: readonly Permission[] = [
  'scope-check.read',
  'scope-check.create',
  'session.end',
  'config.read-self',
  'config.write-self',
  'notification.read',
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

// Seeded straight from the architecture permission matrix (rows: employee core,
// salary, govdata). Each staff role diverges — field-level sensitivity means
// e.g. Finance updates salary but never govdata, GRO the reverse.
export const ROLE_PERMISSIONS: Record<RoleName, readonly Permission[]> = {
  // core R · salary R · govdata R (read-only on employee data; power is config):
  // the ONLY holder of config.write — writes deployment-wide system settings.
  system_admin: [...STAFF_BASE, ...ADMIN_EXTRA, 'salary.read', 'govdata.read', 'config.write'],
  // core CRUD · salary R · govdata R; manages PER-CLIENT config overrides
  // (matrix — per-client settings are Company Admin's, distinct from the
  // System Admin's system-level config.write).
  company_admin: [
    ...STAFF_BASE,
    ...ADMIN_EXTRA,
    'employee.create',
    'employee.update',
    'employee.delete',
    'salary.read',
    'govdata.read',
    'config.write-client',
    'document.upload',
    'document.delete',
  ],
  // core R · salary – · govdata – · documents: recruitment (category-scoped)
  recruiter: [...STAFF_BASE, 'document.upload', 'document.delete'],
  // core CRUD · salary RU · govdata R · documents: all
  hr_officer: [
    ...STAFF_BASE,
    'employee.create',
    'employee.update',
    'employee.delete',
    'salary.read',
    'salary.update',
    'govdata.read',
    'document.upload',
    'document.delete',
  ],
  // core RU · salary – · govdata CRUD · documents: government (category-scoped)
  gro_officer: [
    ...STAFF_BASE,
    'employee.update',
    'govdata.read',
    'govdata.update',
    'document.upload',
    'document.delete',
  ],
  // core R · salary RU · govdata –
  finance: [...STAFF_BASE, 'salary.read', 'salary.update'],
  // core R · salary – · govdata R
  read_only: [...STAFF_BASE, 'govdata.read'],
  client_admin: CLIENT_ADMIN,
  client_user: ALL_CLIENT,
};
