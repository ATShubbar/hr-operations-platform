// Isolation-harness endpoint registry (WS-18, ADR-001).
//
// EVERY HTTP route in the API must appear here with its scope class:
//   public        — probed unauthenticated (health checks, login)
//   session       — self-checking session-flow endpoints (MFA): must return
//                   401 to unauthenticated callers despite being @Public to
//                   the guard
//   staff         — consultancy-staff endpoints; cross-client by permission
//   client-scoped — MUST return only the caller's client's data; the harness
//                   probes these with wrong-client principals
//   client-write  — client-scoped MUTATION; must reject unauthenticated
//                   callers (401). Cross-client write leakage is barred by RLS
//                   WITH CHECK and proven per-endpoint (e.g. AUDIT-03 e2e).
//   client-read   — client-scoped READ whose response is not the bare
//                   scope-check row shape (e.g. {users:[...]}); must reject
//                   unauthenticated callers (401). Own-client scoping is proven
//                   per-endpoint (e.g. CLIENT-03 e2e), not by this harness.
//   self          — endpoints operating on the caller's OWN identity (any
//                   authenticated principal — staff, client rep or employee),
//                   e.g. per-user preferences, sign-out. Must reject unauthenticated
//                   callers (401). Own-actor scoping is enforced in-app via the
//                   request context (actorId is never taken from input) and
//                   proven per-endpoint (e.g. CONF-03 e2e), not by this harness.
//
//   employee      — employee self-service (ADR-011): MUST return only the
//                   calling employee's OWN record. Probed with a COLLEAGUE AT
//                   THE SAME COMPANY (the case the client boundary cannot
//                   catch) and unauthenticated. A route's response must carry
//                   the caller's employee id somewhere (the record id, or — for
//                   lists — fixture rows titled with their owner's id).
//   employee-write — employee self-service MUTATION (e.g. raising one's own
//                   request). Must reject unauthenticated callers (401); what
//                   may be written is barred by RLS WITH CHECK and proven
//                   per-endpoint (SS-05 e2e) — the `client-write` counterpart.
//   employee-read — employee self-service with a PATH PARAMETER (e.g. one
//                   document's download), which the generic loop cannot
//                   address. Must reject unauthenticated callers (401);
//                   own-record scoping is proven per-endpoint (SS-04 e2e) —
//                   the employee counterpart of `client-read`.
//
// Independently of class, every route that is not public / session / self must
// REFUSE an employee principal (403) — the principal fence that keeps
// employees off staff and client-rep endpoints whatever permissions they hold.
//
// The coverage spec diffs this registry against the app's live route map in
// BOTH directions — an unregistered route (or a stale entry) fails CI.
export type ScopeClass =
  | 'public'
  | 'session'
  | 'staff'
  | 'client-scoped'
  | 'client-write'
  | 'client-read'
  | 'self'
  | 'employee'
  | 'employee-read'
  | 'employee-write';

export const ENDPOINT_REGISTRY: Record<string, ScopeClass> = {
  'GET /health': 'public',
  'GET /ready': 'public',
  'POST /auth/login': 'public',
  // SS-06a: set a password from a one-time emailed link (the TOKEN is the
  // credential), and "forgot password" (always 202, reveals nothing).
  'POST /auth/account/set-password': 'public',
  'POST /me/password-reset': 'public',
  'GET /auth/me': 'session',
  // Every principal signs out (staff, client rep, employee) — the caller's OWN
  // session. Was 'staff' until SS-02 introduced a principal that is neither.
  'POST /auth/logout': 'self',
  'POST /auth/mfa/enroll': 'session',
  'POST /auth/mfa/verify': 'session',
  'POST /auth/mfa/challenge': 'session',
  'GET /audit': 'staff',
  'GET /access': 'client-read',
  'GET /audit/summary': 'staff',
  // Configuration (CONF-01): system settings are deployment-wide (not client-
  // owned), so these are staff endpoints — cross-client by permission, not
  // client-scoped. config.read for the reads; config.write (Administrator) writes.
  'GET /config': 'staff',
  'GET /config/catalog': 'staff',
  'GET /config/flags': 'staff',
  'PATCH /config/system/:key': 'staff',
  // Per-client config (CONF-02): staff-managed (Administrator) for an EXPLICIT
  // client id in the path — staff cross-client by permission, so 'staff' (not
  // client-scoped). The cfg_client_settings table still ships RLS for the
  // future client-rep read path (portal).
  'GET /config/client/:clientId': 'staff',
  'PATCH /config/client/:clientId/:key': 'staff',
  'DELETE /config/client/:clientId/:key': 'staff',
  // Per-user preferences (CONF-03): the caller's OWN, any authenticated
  // principal; actor from the session, never the URL (own-actor scoping proven
  // in configuration-me.e2e-spec).
  'GET /config/me': 'self',
  'PATCH /config/me/:key': 'self',
  'DELETE /config/me/:key': 'self',
  // In-app notifications (NOTIF-02): the caller's OWN, any authenticated
  // principal; actor from the session, never the URL.
  'GET /notifications': 'self',
  'POST /notifications/:id/read': 'self',
  'POST /notifications/read-all': 'self',
  // Per-user notification email preferences (NOTIF-04): the caller's OWN, any
  // authenticated principal; actor from the session, never the URL.
  'GET /notifications/preferences': 'self',
  'PATCH /notifications/preferences/:category': 'self',
  'GET /clients': 'staff',
  'GET /clients/:id': 'staff',
  'POST /clients': 'staff',
  'PATCH /clients/:id': 'staff',
  'DELETE /clients/:id': 'staff',
  'GET /employees': 'staff',
  'GET /employees/:id': 'staff',
  'POST /employees': 'staff',
  'PATCH /employees/:id': 'staff',
  'PATCH /employees/:id/salary': 'staff',
  'PATCH /employees/:id/govdata': 'staff',
  'DELETE /employees/:id': 'staff',
  // Documents upload flow (DOC-02): staff issue/confirm for an explicit client
  // in the body — cross-client by permission, so 'staff'. Client-rep upload-own
  // is deferred (portal); the table still ships RLS.
  'POST /documents': 'staff',
  'POST /documents/:id/confirm': 'staff',
  'GET /documents': 'staff',
  'GET /documents/:id': 'staff',
  'GET /documents/:id/download': 'staff',
  'DELETE /documents/:id': 'staff',
  'POST /documents/:id/legal-hold': 'staff',
  // Document-expiry manual trigger (EXP-02): admin-only, system-wide (cross-
  // client) scan returning a run summary — no client data, so 'staff'.
  'POST /expiry/scan': 'staff',
  // Requests (REQ-02): the first DUAL-PATH resource — staff cross-client, client
  // reps own-client (RLS-enforced). Reads are client-read (own-scoping proven in
  // the REQ-02 e2e); writes are client-write (cross-client barred by RLS WITH
  // CHECK, proven per-endpoint). All must reject unauthenticated callers.
  'POST /requests': 'client-write',
  'GET /requests': 'client-read',
  'GET /requests/:id': 'client-read',
  'PATCH /requests/:id': 'client-write',
  // Processing (REQ-03) is STAFF-only (request.process; client reps lack it) and
  // cross-client — so 'staff', not a client-scoped class.
  'POST /requests/:id/process': 'staff',
  // Tasks (TASK-02): internal, STAFF-only (clients have no task access). The
  // matrix own/assigned scope is enforced in-handler (task.read-all), so 'staff'.
  'POST /tasks': 'staff',
  'GET /tasks': 'staff',
  'GET /tasks/:id': 'staff',
  'PATCH /tasks/:id': 'staff',
  'DELETE /tasks/:id': 'staff',
  // Recruitment vacancies (REC-02): asymmetric dual-path. Reads are client-read
  // (staff cross-client; client reps own-client, RLS-enforced, own-scoping proven
  // in the REC-02 e2e). All WRITES are STAFF-only (clients hold no vacancy write
  // permission and app_client has a SELECT-only grant) — so 'staff', not a
  // client-scoped write class.
  'POST /vacancies': 'staff',
  'GET /vacancies': 'client-read',
  'GET /vacancies/:id': 'client-read',
  'PATCH /vacancies/:id': 'staff',
  'POST /vacancies/:id/status': 'staff',
  'DELETE /vacancies/:id': 'staff',
  // Recruitment candidates (REC-04): STAFF-INTERNAL only — clients never see
  // applicants, so every route is 'staff' (cross-client by permission, like Tasks).
  // Who may read/write recruitment is the v1.7 matrix (role-matrix.e2e-spec).
  'POST /candidates': 'staff',
  'GET /candidates': 'staff',
  'GET /candidates/:id': 'staff',
  'PATCH /candidates/:id': 'staff',
  'POST /candidates/:id/stage': 'staff',
  'DELETE /candidates/:id': 'staff',
  // GRO processes (GRO-02): a dual-path resource. Reads are client-read (staff
  // cross-client; client reps own-client STATUS-ONLY, RLS-enforced — own-scoping +
  // redaction proven in the GRO-02 e2e). All WRITES are STAFF-only (clients hold no
  // gro.process and app_client has a SELECT-only grant). No delete verb (cancel via
  // status).
  'POST /gro-processes': 'staff',
  'GET /gro-processes': 'client-read',
  'GET /gro-processes/:id': 'client-read',
  'PATCH /gro-processes/:id': 'staff',
  'POST /gro-processes/:id/status': 'staff',
  // Calendar (CAL-02): STAFF-ONLY — clients have no calendar access, so every route
  // is 'staff'. Events are own-scoped (calendar.read-all lifts it); the /calendar/view
  // endpoint merges Tasks/Requests/GRO deadlines read-only. Own-scoping + source
  // gating proven in the CAL-02 e2e.
  'POST /calendar/events': 'staff',
  'GET /calendar/events': 'staff',
  'GET /calendar/events/:id': 'staff',
  'PATCH /calendar/events/:id': 'staff',
  'DELETE /calendar/events/:id': 'staff',
  'GET /calendar/view': 'staff',
  // Google Calendar invitations (GCAL-02): STAFF-ONLY (integration data; clients have
  // no access), so every route is 'staff'. Outbound-only, adapter-enforced payloads.
  'POST /integrations/google-calendar/invitations': 'staff',
  'GET /integrations/google-calendar/invitations': 'staff',
  'GET /integrations/google-calendar/invitations/:id': 'staff',
  'PATCH /integrations/google-calendar/invitations/:id': 'staff',
  'DELETE /integrations/google-calendar/invitations/:id': 'staff',
  // Client Portal (PORTAL-01/02/03): client-only self-service reads, scoped to
  // the caller's own client (proven in the portal-* e2e specs); 401 on unauth.
  // Employees are redacted to core + govdata:status (PORTAL-02); documents are
  // AVAILABLE-only and downloads presign per-client storage keys (PORTAL-03).
  // Employee self-service (SS-03, ADR-011): the caller's OWN employee record —
  // the first route in the `employee` class, probed with a same-company colleague.
  // SS-06a: staff management of employee accounts (employee-user.*; Company
  // Admin + HR Officer) — cross-client by permission.
  'GET /employee-accounts/:employeeId': 'staff',
  'POST /employee-accounts/:employeeId/invite': 'staff',
  'PATCH /employee-accounts/:employeeId': 'staff',
  'GET /me': 'employee',
  // My documents (SS-04): the list is probed by the colleague loop; the download
  // takes an id, so it is `employee-read` (scoping proven in self-service-documents.e2e).
  'GET /me/documents': 'employee',
  'GET /me/documents/:id/download': 'employee-read',
  // My requests (SS-05): the list is probed by the colleague loop; raising one
  // is the employee's only write (scoping proven in self-service-requests.e2e).
  'GET /me/requests': 'employee',
  'POST /me/requests': 'employee-write',
  // My leave (ADR-014, LEAVE-02): the list carries each row's employee id, so
  // the colleague loop probes it directly; raising and withdrawing are writes
  // (scoping proven in leave-api.e2e + the LEAVE-01 RLS spec).
  'GET /me/leave': 'employee',
  // Global search (ADR-015): every principal searches its OWN view — staff
  // cross-client by permission, a client manager their company, an employee
  // their own requests/leave. Scoping is proven per role in search.e2e.
  'GET /search': 'self',
  'POST /me/leave': 'employee-write',
  'POST /me/leave/:id/withdraw': 'employee-write',
  // LEAVE-03: my balance carries my employee id (`employee.id`).
  'GET /me/leave/balance': 'employee',
  // Leave (LEAVE-02): dual-path like Requests — staff cross-client, client
  // managers own company (RLS). Filing is PEOPLE&GRO's alone.
  'GET /leave': 'client-read',
  'GET /leave/:id': 'client-read',
  'POST /leave': 'client-write',
  'POST /leave/:id/approve': 'client-write',
  'POST /leave/:id/decline': 'client-write',
  'POST /leave/:id/withdraw': 'client-write',
  'POST /leave/:id/file': 'staff',
  // Balances (LEAVE-03): own company for client managers (proven in leave-balance-api.e2e).
  'GET /leave/balances': 'client-read',
  'GET /leave/balances/:employeeId': 'client-read',
  'POST /leave/carry-over': 'staff',
  'GET /portal/company': 'client-read',
  'GET /portal/employees': 'client-read',
  'GET /portal/employees/:id': 'client-read',
  'GET /portal/documents': 'client-read',
  'GET /portal/documents/:id': 'client-read',
  'GET /portal/documents/:id/download': 'client-read',
  // Reporting (REP-02): STAFF-ONLY, read-only, cross-client by permission — so
  // 'staff'. `report.read` admits the caller; each report's own
  // requiredPermissions decide which reports are listed and runnable (proven in
  // the REP-02 e2e: a reader without salary.read cannot list or run payroll-cost).
  'GET /reports': 'staff',
  'GET /reports/:id': 'staff',
  // REP-03: the CSV export — same data gate plus the distinct `report.export`
  // capability, and audited (resource 'report', action 'export').
  'GET /reports/:id/export': 'staff',
  'GET /example/greeting': 'staff',
  'GET /example-consumer/relay': 'staff',
  'GET /scope-check': 'client-scoped',
  'POST /scope-check': 'client-write',
  // Staff users (UX-10b). NOT client-scoped — staff have no client_id, so there
  // is no scope key to isolate on; the permission is the whole gate.
  'GET /roles': 'staff',
  'GET /staff-users': 'staff',
  'GET /staff-users/directory': 'staff',
  'GET /staff-users/:id': 'staff',
  'POST /staff-users': 'staff',
  'PATCH /staff-users/:id': 'staff',
  'DELETE /staff-users/:id': 'staff',
  // ROLE-02: the STAFF path to the same users — company from the PATH, staff
  // only (client reps refused by scopeOf even though they hold client-user.*;
  // proven in client-portal-users.e2e-spec).
  // AUDIT-06: one person's curated history — staff only (employee.history).
  'GET /employees/:id/history': 'staff',
  // DS-08: a request's decision trail — staff only (request.read), curated.
  'GET /requests/:id/history': 'staff',
  'GET /clients/:clientId/users': 'staff',
  'GET /clients/:clientId/users/:id': 'staff',
  'POST /clients/:clientId/users': 'staff',
  'PATCH /clients/:clientId/users/:id': 'staff',
  'DELETE /clients/:clientId/users/:id': 'staff',
};
