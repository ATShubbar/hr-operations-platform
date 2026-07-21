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
//
// The coverage spec diffs this registry against the app's live route map in
// BOTH directions — an unregistered route (or a stale entry) fails CI.
export type ScopeClass =
  | 'public'
  | 'session'
  | 'staff'
  | 'client-scoped'
  | 'client-write';

export const ENDPOINT_REGISTRY: Record<string, ScopeClass> = {
  'GET /health': 'public',
  'GET /ready': 'public',
  'POST /auth/login': 'public',
  'POST /auth/logout': 'staff',
  'POST /auth/mfa/enroll': 'session',
  'POST /auth/mfa/verify': 'session',
  'POST /auth/mfa/challenge': 'session',
  'GET /audit': 'staff',
  'GET /example/greeting': 'staff',
  'GET /example-consumer/relay': 'staff',
  'GET /scope-check': 'client-scoped',
  'POST /scope-check': 'client-write',
};
