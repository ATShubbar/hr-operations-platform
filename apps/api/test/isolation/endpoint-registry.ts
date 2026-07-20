// Isolation-harness endpoint registry (WS-18, ADR-001).
//
// EVERY HTTP route in the API must appear here with its scope class:
//   public        — probed unauthenticated (health checks only)
//   staff         — consultancy-staff endpoints; cross-client by permission
//   client-scoped — MUST return only the caller's client's data; the harness
//                   probes these with wrong-client principals
//
// The coverage spec diffs this registry against the app's live route map in
// BOTH directions — an unregistered route (or a stale entry) fails CI.
export type ScopeClass = 'public' | 'staff' | 'client-scoped';

export const ENDPOINT_REGISTRY: Record<string, ScopeClass> = {
  'GET /health': 'public',
  'GET /ready': 'public',
  'POST /auth/login': 'public',
  'GET /example/greeting': 'staff',
  'GET /example-consumer/relay': 'staff',
  'GET /scope-check': 'client-scoped',
};
