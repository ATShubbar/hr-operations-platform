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
  // their OWN in-app notifications. Per-user email preferences (NOTIF-04) —
  // toggling which categories email is sent for — is notification-pref.update.
  'notification.read',
  'notification-pref.update',
  // Document-expiry engine (EXP-02): admins may trigger the system-wide scan on
  // demand (POST /expiry/scan). The automatic daily run is scheduled, not a
  // permissioned route.
  'expiry.run',
  // Requests (REQ-02; permission matrix): all staff + both client roles READ;
  // Company Admin + client reps CREATE; Company Admin + Client Admin UPDATE
  // (Client User is create+read only). Advancing status is request.process (REQ-03).
  'request.read',
  'request.create',
  'request.update',
  // Advancing a request through its status workflow (REQ-03): Company Admin + HR
  // Officer + GRO Officer (matrix — the RU-process roles). Staff-only.
  'request.process',
  // Tasks (TASK-02; permission matrix): internal work items, staff-only. Most
  // staff read/create/update tasks restricted to OWN/ASSIGNED; `task.read-all`
  // lifts that to all-tasks (Admins + Read Only). Company Admin also deletes.
  'task.read',
  'task.read-all',
  'task.create',
  'task.update',
  'task.delete',
  // Recruitment vacancies (REC-02; permission matrix). NOT granted to every staff
  // role — GRO Officer + Finance are excluded from recruitment. Recruiter has full
  // CRUD; Company Admin reads/updates/approves; System Admin/HR Officer/Read Only
  // read; both client roles read their OWN vacancies (portal-style). `vacancy.approve`
  // advances the status workflow (draft → open → filled/closed).
  'vacancy.read',
  'vacancy.create',
  'vacancy.update',
  'vacancy.approve',
  'vacancy.delete',
  // Recruitment candidates (REC-04; permission matrix — same row as vacancies but
  // STAFF-INTERNAL: clients never see candidates). Recruiter has full CRUD +
  // pipeline control; Company Admin reads/updates/advances; System Admin/HR Officer/
  // Read Only read; GRO/Finance excluded. `candidate.advance` walks the stage workflow.
  'candidate.read',
  'candidate.create',
  'candidate.update',
  'candidate.advance',
  'candidate.delete',
  // GRO government processes (GRO-02; permission matrix — the frozen catalog names
  // exactly these two). `gro.read` — all staff except Recruiter/Finance read, plus
  // both client roles read their OWN (status only); `gro.process` — GRO Officer +
  // Company Admin create/update/advance. No delete verb (cancel via status).
  'gro.read',
  'gro.process',
  // Client Portal (PORTAL-01): client-only self-service access. Gates /portal/*.
  'portal.read',
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
  'notification-pref.update',
  'request.read',
  // Tasks: every staff role reads tasks (own/assigned by default — task.read-all
  // lifts the scope to all).
  'task.read',
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
  'notification-pref.update',
  // Requests (REQ-02): both client roles read + create their own client's
  // requests; Client Admin additionally updates (added in CLIENT_ADMIN).
  'request.read',
  'request.create',
  // Client Portal (PORTAL-01): the client self-service surface. A client-only
  // permission (staff never hold it) that gates every /portal/* read — reps use
  // dedicated portal endpoints, not the staff resource endpoints.
  'portal.read',
  // Recruitment (REC-02): both client roles read their OWN client's vacancies.
  'vacancy.read',
  // GRO (GRO-02): both client roles read their OWN client's processes (status only).
  'gro.read',
];
// Client Admin additionally manages its own client's portal users (matrix —
// Client User does NOT).
const CLIENT_ADMIN: readonly Permission[] = [
  ...ALL_CLIENT,
  'client-user.read',
  'client-user.create',
  'client-user.update',
  'client-user.delete',
  // Client Admin updates its own client's requests (Client User does not).
  'request.update',
];

// Seeded straight from the architecture permission matrix (rows: employee core,
// salary, govdata). Each staff role diverges — field-level sensitivity means
// e.g. Finance updates salary but never govdata, GRO the reverse.
export const ROLE_PERMISSIONS: Record<RoleName, readonly Permission[]> = {
  // core R · salary R · govdata R (read-only on employee data; power is config):
  // the ONLY holder of config.write — writes deployment-wide system settings.
  system_admin: [
    ...STAFF_BASE,
    ...ADMIN_EXTRA,
    'salary.read',
    'govdata.read',
    'config.write',
    'task.read-all',
    'vacancy.read',
    'candidate.read',
    'gro.read',
  ],
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
    // Requests: Company Admin has full CRUD (create + update here; delete later)
    // and processes them.
    'request.create',
    'request.update',
    'request.process',
    'task.read-all',
    'task.create',
    'task.update',
    'task.delete',
    // Recruitment: Company Admin reads/updates/approves vacancies (no create/delete)
    // and reads/updates/advances candidates.
    'vacancy.read',
    'vacancy.update',
    'vacancy.approve',
    'candidate.read',
    'candidate.update',
    'candidate.advance',
    // GRO: Company Admin reads + manages processes (matrix RU → gro.read + gro.process).
    'gro.read',
    'gro.process',
  ],
  // core R · salary – · govdata – · documents: recruitment (category-scoped).
  // The primary recruitment role: full vacancy CRUD + approve (matrix).
  recruiter: [
    ...STAFF_BASE,
    'document.upload',
    'document.delete',
    'task.create',
    'task.update',
    'vacancy.read',
    'vacancy.create',
    'vacancy.update',
    'vacancy.approve',
    'vacancy.delete',
    'candidate.read',
    'candidate.create',
    'candidate.update',
    'candidate.advance',
    'candidate.delete',
  ],
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
    'request.process',
    'task.create',
    'task.update',
    // HR Officer reads vacancies + candidates (matrix R); recruitment CRUD is the
    // Recruiter's. GRO: reads processes (matrix R).
    'vacancy.read',
    'candidate.read',
    'gro.read',
  ],
  // core RU · salary – · govdata CRUD · documents: government (category-scoped).
  // The primary GRO role: full process management (matrix CRUD → gro.read + gro.process).
  gro_officer: [
    ...STAFF_BASE,
    'employee.update',
    'govdata.read',
    'govdata.update',
    'document.upload',
    'document.delete',
    'request.process',
    'task.create',
    'task.update',
    'gro.read',
    'gro.process',
  ],
  // core R · salary RU · govdata –
  finance: [...STAFF_BASE, 'salary.read', 'salary.update', 'task.create', 'task.update'],
  // core R · salary – · govdata R (Finance holds no recruitment/GRO perms — matrix)
  read_only: [
    ...STAFF_BASE,
    'govdata.read',
    'task.read-all',
    'vacancy.read',
    'candidate.read',
    'gro.read',
  ],
  client_admin: CLIENT_ADMIN,
  client_user: ALL_CLIENT,
};
