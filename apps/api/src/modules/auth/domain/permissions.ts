// Permission catalog + role mapping (AUTH-04, ADR-002).
//
// THE rules:
// - Permission names follow the frozen `resource.action` convention
//   (architecture.md → Permission naming convention).
// - Every `@RequirePermission` value in the codebase MUST be in PERMISSIONS
//   (enforced by the catalog-coverage spec — undeclared permissions fail CI).
// - Roles come from the architecture's permission matrix; granting happens
//   HERE, in data — never as role conditionals in handlers.

// WHO holds each permission is ROLE_PERMISSIONS below (the v1.7 matrix, ADR-013);
// the comments in this list say what each permission MEANS and where it came from.
export const PERMISSIONS = [
  // Walking-skeleton exemplar capabilities. Real module permissions are
  // added here in the same commit as their endpoints.
  'example.read',
  'scope-check.read',
  'scope-check.create',
  // Audit log read.
  'audit.read',
  // AUDIT-07: take a copy of the trail (CSV, with values) — itself audited as Critical.
  'audit.export',
  // Client companies: staff read the registry; writes create/update/archive.
  // A client rep's own company is read through the portal (portal.read).
  'client.read',
  'client.create',
  'client.update',
  'client.delete',
  // Staff users — ADMINISTERING accounts (matrix row "System config & staff
  // users", UX-10b).
  'staff-user.read',
  'staff-user.create',
  'staff-user.update',
  'staff-user.delete',
  // …and a DELIBERATELY NARROWER capability, held by every staff role.
  //
  // The matrix row above governs ADMINISTERING accounts. Knowing which colleague
  // a task is assigned to is not that: without it an HR Officer sees a truncated
  // UUID where a name belongs, which is the bug UX-10b exists to fix. Rather than
  // widen the restricted row (drift), this grants a separate, strictly smaller
  // capability whose endpoint returns ONLY id + display name + role — no email,
  // no status, no MFA state. Owner-approved as a catalog addition, not a matrix
  // change (UX-10b, option 2).
  'staff-user.directory',
  // Client portal users (CLIENT-03; ROLE-02/03): managing a client's portal
  // accounts over the staff path /clients/:clientId/users. Staff-only.
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
  // A person's HISTORY (AUDIT-06): what happened on their record, documents and
  // GRO processes — who, what, when, never the before/after values. Narrower
  // than audit.read (the full log, Administrator + Auditor) and held by every
  // staff role that reads employee records. Owner-approved as a CATALOG
  // ADDITION, the staff-user.directory pattern (UX-10b), not a matrix change.
  'employee.history',
  'salary.read',
  'salary.update',
  'govdata.read',
  'govdata.update',
  // Documents (DOC-02/03; permission matrix): all staff read; CRUD roles upload
  // and delete (category scope — GRO → government categories, Administrator/HR
  // officer → all — is a finer in-handler check on upload + delete).
  'document.read',
  'document.upload',
  'document.delete',
  // Configuration (CONF-01/02; permission matrix): all staff read effective
  // settings + catalog; `config.write` is the SYSTEM level (deployment-wide
  // defaults), `config.write-client` the PER-CLIENT overrides (never written by
  // the client themselves).
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
  // Document-expiry engine (EXP-02): triggering the system-wide scan on
  // demand (POST /expiry/scan). The automatic daily run is scheduled, not a
  // permissioned route.
  'expiry.run',
  // Requests (REQ-02): read, raise, edit. Client managers read + raise their own
  // company's. Advancing status is request.process (REQ-03).
  'request.read',
  'request.create',
  'request.update',
  // Advancing a request through its status workflow (REQ-03). Staff-only.
  'request.process',
  // Posting on a request's thread (ADR-016): every role that sees requests
  // EXCEPT the Auditor (reads the thread, posts nothing). Employees post through
  // /me under self-service.* — never this.
  'request.comment',
  // Tasks (TASK-02; permission matrix): internal work items, staff-only. Most
  // staff read/create/update tasks restricted to OWN/ASSIGNED; `task.read-all`
  // lifts that to all tasks.
  'task.read',
  'task.read-all',
  'task.create',
  'task.update',
  'task.delete',
  // Recruitment vacancies (REC-02). Granted per role, not via STAFF_BASE; client
  // managers read their OWN company's vacancies. `vacancy.approve` advances the
  // status workflow (draft → open → filled/closed).
  'vacancy.read',
  'vacancy.create',
  'vacancy.update',
  'vacancy.approve',
  'vacancy.delete',
  // Recruitment candidates (REC-04; permission matrix — same row as vacancies but
  // STAFF-INTERNAL: clients never see candidates, REC-03). `candidate.advance`
  // walks the stage workflow.
  'candidate.read',
  'candidate.create',
  'candidate.update',
  'candidate.advance',
  'candidate.delete',
  // GRO government processes (GRO-02; permission matrix — the frozen catalog names
  // exactly these two). `gro.read` — client managers read their OWN as status
  // only; `gro.process` — create/update/advance. No delete verb (cancel via status).
  'gro.read',
  'gro.process',
  // Leave (ADR-014, LEAVE-02). Client managers raise + APPROVE their own
  // company's; PEOPLE&GRO FILES (writes the ledger); `withdraw` = a pending
  // request the caller raised. Employees never hold these — /me/leave is
  // self-service.* (ADR-011 rev. 2).
  'leave.read',
  'leave.create',
  'leave.approve',
  'leave.file',
  'leave.withdraw',
  // Running the yearly carry-over by hand (LEAVE-03; ADR-014 rev. 1). The 1 January
  // job runs it automatically; this lets an Administrator re-run it (idempotent).
  'leave.carry-over',
  // Global search (ADR-015, SEARCH-01): admits a caller to the header box. It
  // reveals nothing by itself — each kind of result is gated by its own read
  // permission (identifiers only for govdata.read). Every role holds it.
  'search.read',
  // Calendar (CAL-02; permission matrix). STAFF-ONLY. All staff read (own events by
  // default); `calendar.read-all` lifts read/update/delete to ALL events — so a
  // role cannot be "write own, read all" (ROLE-03 found this; the v1.7 matrix
  // follows the prototype's RWCD for HR/GRO).
  'calendar.read',
  'calendar.read-all',
  'calendar.create',
  'calendar.update',
  'calendar.delete',
  // Google Calendar integration (GCAL-02; ADR-009). One coarse permission gates the
  // outbound invitation surface (create/update/cancel/read) — the staff who schedule
  // interviews, meetings and government appointments hold it.
  'integration.google-calendar',
  // Reporting (REP-02). The COARSE gate on /reports; WHICH reports a caller sees
  // is a second, finer check against each report's declared requiredPermissions
  // (the report catalog), so `report.read` alone never exposes salary or GRO
  // figures. Administrator + Auditor since v1.7 (ADR-013).
  'report.read',
  // Exporting a report (REP-03) is a DISTINCT capability from reading it: a bulk
  // extraction is the point where data leaves the platform's authorization
  // boundary, and it is audited. Administrator only — the Auditor reads, and
  // reading is not bulk extraction.
  'report.export',
  // Client Portal (PORTAL-01): client-only self-service access. Gates /portal/*.
  'portal.read',
  // Employee self-service (SS-03, ADR-011 rev. 2): employee-only. Gates /me*.
  // A DEDICATED permission on purpose — the employee role must never hold the
  // staff names (employee.read, document.read, …): the staff endpoints that
  // check those do not look at the principal, so granting them would open
  // every company's records to every employee. The isolation harness's
  // principal fence fails the build if that ever happens.
  'self-service.read',
  // SS-05: the one thing an employee writes — raising their own request
  // (POST /me/requests). A separate verb from `.read` (the resource.action
  // convention), still employee-only and still never a staff resource name.
  'self-service.create',
  // SS-06a: staff management of employee self-service ACCOUNTS (ADR-011): invite
  // (or re-invite) an employee, read the account's state, deactivate/reactivate.
  // `invite` is a verb outside the base set —
  // named in ADR-011 and approved with it, because "create" would misdescribe an
  // account that cannot be used until its holder accepts.
  'employee-user.read',
  'employee-user.invite',
  'employee-user.update',
  // Session lifecycle — every authenticated principal may end their session.
  'session.end',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// Six built-in roles (ADR-013, architecture.md v1.7) — four staff, one client,
// one employee. The database ties each to its principal type
// (auth_users_role_principal_chk), so these lists and the column cannot drift.
export const STAFF_ROLES = ['administrator', 'hr_officer', 'gro_officer', 'auditor'] as const;

export const CLIENT_ROLES = ['client_manager'] as const;

// Employee self-service (ADR-011). One role for the third principal type.
export const EMPLOYEE_ROLES = ['employee'] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];
export type ClientRole = (typeof CLIENT_ROLES)[number];
export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];
export type RoleName = StaffRole | ClientRole | EmployeeRole;

// Every staff role, Auditor included: session, the colleague directory, client
// companies, the employee core profile, effective configuration, documents,
// own notifications/preferences, requests, and own tasks + own calendar (the
// `.read-all` capabilities lift those scopes). Reports are NOT here since v1.7:
// the prototype's navigation makes Reports an Administrator screen, and the
// Auditor reads them as part of reading everything (ADR-013).
const STAFF_BASE: readonly Permission[] = [
  'example.read',
  'session.end',
  // Name resolution for assignees and audit actors — see the catalog note.
  'staff-user.directory',
  'client.read',
  'employee.read',
  'employee.history',
  'config.read',
  'config.read-self',
  'config.write-self',
  'document.read',
  'notification.read',
  'notification-pref.update',
  'request.read',
  'task.read',
  'calendar.read',
  // ADR-015: the header search box (results gated per source).
  'search.read',
];

// The client manager (one company, mostly read): the scope-check exemplar,
// session end, own preferences + notifications, the portal surface (company,
// employees redacted to status, available documents), its own requests (read +
// raise — the prototype's client is `RC`, no update), its own vacancies, and
// its own GRO processes as status only. Portal users are an Administrator's
// (ADR-013, ROLE-02).
const CLIENT_MANAGER: readonly Permission[] = [
  'scope-check.read',
  'scope-check.create',
  'session.end',
  'config.read-self',
  'config.write-self',
  'notification.read',
  'notification-pref.update',
  'request.read',
  'request.create',
  'portal.read',
  'vacancy.read',
  'gro.read',
  // ADR-014: their own company's leave — raise, approve/decline, withdraw own raises.
  'leave.read',
  'leave.create',
  'leave.approve',
  'leave.withdraw',
  // ADR-015: their own requests, leave and (portal on) people.
  'search.read',
  // ADR-016: post on their company's request threads.
  'request.comment',
];

// Each bundle is a column of the v1.7 permission matrix; the matrix spec
// (test/role-matrix.e2e-spec.ts) asserts every cell, so a change here that the
// matrix does not sanction fails CI.
export const ROLE_PERMISSIONS: Record<RoleName, readonly Permission[]> = {
  // Everything, including pay, access and system configuration.
  administrator: [
    ...STAFF_BASE,
    'audit.read',
    'audit.export', // AUDIT-07
    'staff-user.read',
    'staff-user.create',
    'staff-user.update',
    'staff-user.delete',
    'client.create',
    'client.update',
    'client.delete',
    'client-user.read',
    'client-user.create',
    'client-user.update',
    'client-user.delete',
    'employee-user.read',
    'employee-user.invite',
    'employee-user.update',
    'employee.create',
    'employee.update',
    'employee.delete',
    'salary.read',
    'salary.update',
    'govdata.read',
    'govdata.update',
    'config.write',
    'config.write-client',
    'expiry.run',
    'document.upload',
    'document.delete',
    'request.create',
    'request.update',
    'request.process',
    'task.read-all',
    'task.create',
    'task.update',
    'task.delete',
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
    'gro.read',
    'gro.process',
    'calendar.read-all',
    'calendar.create',
    'calendar.update',
    'calendar.delete',
    'integration.google-calendar',
    'report.read',
    'report.export',
    'leave.read',
    'leave.create',
    'leave.approve',
    'leave.file',
    'leave.withdraw',
    'leave.carry-over',
    'request.comment',
  ],
  // People files end to end — pay, contracts, hiring (prototype `hr`: employees
  // RWC, procedures RWC, documents RWCD, requests RWCD, payroll RW, hiring RWC,
  // calendar RWCD). No employee delete; no Reports, no audit (ADR-013).
  hr_officer: [
    ...STAFF_BASE,
    'employee-user.read',
    'employee-user.invite',
    'employee-user.update',
    'employee.create',
    'employee.update',
    'salary.read',
    'salary.update',
    'govdata.read',
    'govdata.update',
    'document.upload',
    'document.delete',
    'request.create',
    'request.update',
    'request.process',
    'task.create',
    'task.update',
    'vacancy.read',
    'vacancy.create',
    'vacancy.update',
    'vacancy.approve',
    'candidate.read',
    'candidate.create',
    'candidate.update',
    'candidate.advance',
    'gro.read',
    'gro.process',
    'calendar.read-all',
    'calendar.create',
    'calendar.update',
    'calendar.delete',
    'integration.google-calendar',
    'leave.read',
    'leave.create',
    'leave.file',
    'leave.withdraw',
    'request.comment',
  ],
  // Government portals and procedures; no pay (prototype `gro`: employees R,
  // procedures RWCD, documents RWC — government categories only, requests RW,
  // hiring RW, calendar RWCD). No Reports, no audit (ADR-013).
  gro_officer: [
    ...STAFF_BASE,
    'govdata.read',
    'govdata.update',
    'document.upload',
    'request.process',
    'task.create',
    'task.update',
    'vacancy.read',
    'vacancy.update',
    'candidate.read',
    'candidate.update',
    'candidate.advance',
    'gro.read',
    'gro.process',
    'calendar.read-all',
    'calendar.create',
    'calendar.update',
    'calendar.delete',
    'integration.google-calendar',
    'leave.read',
    'leave.file',
    'request.comment',
  ],
  // Reads everything, changes nothing (prototype `auditor`: R on all nine
  // resources). Reads reports but does not EXPORT them — a bulk extraction is
  // not passive access (REP-03). MFA-required, like the Administrator.
  auditor: [
    ...STAFF_BASE,
    'audit.read',
    'audit.export', // AUDIT-07
    'staff-user.read',
    'client-user.read',
    'employee-user.read',
    'salary.read',
    'govdata.read',
    'task.read-all',
    'vacancy.read',
    'candidate.read',
    'gro.read',
    'calendar.read-all',
    'report.read',
    'leave.read',
  ],
  client_manager: CLIENT_MANAGER,
  // `session.end` (SS-01 — logout is permission-gated, and an account that
  // cannot end its own session is worse than one that can do nothing) and
  // `self-service.read` (SS-03 — the /me surface, behind the SS-02 database
  // fence). NOTHING that a staff or client-rep endpoint checks: ADR-011 rev. 2.
  // Every other route stays 403 by deny-by-default.
  employee: [
    'session.end',
    'self-service.read',
    'self-service.create',
    // SS-07: the shell's own-identity controls — the notification bell (their
    // request status updates already arrive as notifications, SS-05) and the
    // remembered UI language. All three gate ONLY the caller's own routes
    // (`self` in the isolation registry), which the principal fence exempts.
    'notification.read',
    'config.read-self',
    'config.write-self',
    // ADR-015: the header search — their own requests and leave only. A `self`
    // route (the principal fence exempts it); the results are scoped in-app.
    'search.read',
  ],
};
