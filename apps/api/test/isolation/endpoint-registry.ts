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
//   self          — self-service endpoints operating on the caller's OWN
//                   identity (any authenticated principal — staff or client
//                   rep), e.g. per-user preferences. Must reject unauthenticated
//                   callers (401). Own-actor scoping is enforced in-app via the
//                   request context (actorId is never taken from input) and
//                   proven per-endpoint (e.g. CONF-03 e2e), not by this harness.
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
  | 'self';

export const ENDPOINT_REGISTRY: Record<string, ScopeClass> = {
  'GET /health': 'public',
  'GET /ready': 'public',
  'POST /auth/login': 'public',
  'GET /auth/me': 'session',
  'POST /auth/logout': 'staff',
  'POST /auth/mfa/enroll': 'session',
  'POST /auth/mfa/verify': 'session',
  'POST /auth/mfa/challenge': 'session',
  'GET /audit': 'staff',
  // Configuration (CONF-01): system settings are deployment-wide (not client-
  // owned), so these are staff endpoints — cross-client by permission, not
  // client-scoped. config.read for the reads; config.write (System Admin) writes.
  'GET /config': 'staff',
  'GET /config/catalog': 'staff',
  'GET /config/flags': 'staff',
  'PATCH /config/system/:key': 'staff',
  // Per-client config (CONF-02): staff-managed (Company Admin) for an EXPLICIT
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
  'GET /example/greeting': 'staff',
  'GET /example-consumer/relay': 'staff',
  'GET /scope-check': 'client-scoped',
  'POST /scope-check': 'client-write',
  'GET /client-users': 'client-read',
  'GET /client-users/:id': 'client-read',
  'POST /client-users': 'client-write',
  'PATCH /client-users/:id': 'client-write',
  'DELETE /client-users/:id': 'client-write',
};
