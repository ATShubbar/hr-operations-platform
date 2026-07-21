// AUDIT-03 write-audit registry — the "can't-forget" guarantee for mutation
// logging. EVERY mutating live route (POST/PUT/PATCH/DELETE) must appear in
// exactly one of these maps, or the coverage spec fails CI. This is the same
// registry-enforced-in-CI idiom the permission catalog and isolation harness
// use: coverage is enforced, not voluntary.
//
//   AUDITED_WRITES      — business/domain mutations. Value is the
//                         `resource.action` the handler records via
//                         AuditService.record() inside its transaction.
//                         Actual runtime auditing is proven per-endpoint
//                         (see test/audit/audit-mutation.e2e-spec.ts).
//   AUDIT_EXEMPT_WRITES — routes that legitimately write NO business audit
//                         row; value is the (honest) reason.
//
// Scope note: this registry covers business-data mutation logging. Auth/
// session/MFA are a distinct security-event stream (login, logout, MFA); an
// auth-event audit is a separate future concern, so those routes are exempt
// HERE with the reason recorded — not silently uncovered.

export const AUDITED_WRITES: Record<string, string> = {
  'POST /scope-check': 'scope-check.create',
  'POST /clients': 'client.create',
  'PATCH /clients/:id': 'client.update',
  'DELETE /clients/:id': 'client.delete',
  'POST /client-users': 'client-user.create',
  'PATCH /client-users/:id': 'client-user.update',
  'DELETE /client-users/:id': 'client-user.delete',
};

export const AUDIT_EXEMPT_WRITES: Record<string, string> = {
  'POST /auth/login': 'creates a Redis session only; no business-table mutation (auth-event audit is a separate concern)',
  'POST /auth/logout': 'revokes a Redis session only; no business-table mutation',
  'POST /auth/mfa/enroll': 'stages a pending secret in the Redis session; no business-table mutation',
  'POST /auth/mfa/verify': 'persists mfa_secret to auth_users — a SECURITY event, out of scope for business-data audit; belongs to the future auth-event audit stream',
  'POST /auth/mfa/challenge': 'promotes the Redis session to full; no business-table mutation',
};
