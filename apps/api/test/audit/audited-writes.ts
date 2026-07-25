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
  'POST /staff-users': 'staff-user.create',
  'PATCH /staff-users/:id': 'staff-user.update',
  'DELETE /staff-users/:id': 'staff-user.delete',
  'POST /client-users': 'client-user.create',
  'PATCH /client-users/:id': 'client-user.update',
  'DELETE /client-users/:id': 'client-user.delete',
  'POST /employees': 'employee.create',
  'PATCH /employees/:id': 'employee.update',
  'PATCH /employees/:id/salary': 'salary.update',
  'PATCH /employees/:id/govdata': 'govdata.update',
  'DELETE /employees/:id': 'employee.delete',
  'POST /documents': 'document.create',
  'POST /documents/:id/confirm': 'document.confirm',
  'DELETE /documents/:id': 'document.delete',
  'POST /documents/:id/legal-hold': 'document.legal-hold',
  'PATCH /config/system/:key': 'config.system-set',
  'PATCH /config/client/:clientId/:key': 'config.client-set',
  'DELETE /config/client/:clientId/:key': 'config.client-clear',
  'PATCH /config/me/:key': 'config.user-set',
  'DELETE /config/me/:key': 'config.user-clear',
  'PATCH /notifications/preferences/:category': 'notification-pref.update',
  'POST /requests': 'request.create',
  'PATCH /requests/:id': 'request.update',
  'POST /requests/:id/process': 'request.process',
  'POST /tasks': 'task.create',
  'PATCH /tasks/:id': 'task.update',
  'DELETE /tasks/:id': 'task.delete',
  'POST /vacancies': 'vacancy.create',
  'PATCH /vacancies/:id': 'vacancy.update',
  'POST /vacancies/:id/status': 'vacancy.status',
  'DELETE /vacancies/:id': 'vacancy.delete',
  'POST /candidates': 'candidate.create',
  'PATCH /candidates/:id': 'candidate.update',
  'POST /candidates/:id/stage': 'candidate.stage',
  'DELETE /candidates/:id': 'candidate.delete',
  'POST /gro-processes': 'gro-process.create',
  'PATCH /gro-processes/:id': 'gro-process.update',
  'POST /gro-processes/:id/status': 'gro-process.status',
  'POST /calendar/events': 'calendar-event.create',
  'PATCH /calendar/events/:id': 'calendar-event.update',
  'DELETE /calendar/events/:id': 'calendar-event.delete',
  'POST /integrations/google-calendar/invitations': 'gcal-invitation.create',
  'PATCH /integrations/google-calendar/invitations/:id': 'gcal-invitation.update',
  'DELETE /integrations/google-calendar/invitations/:id': 'gcal-invitation.cancel',
};

// AUDITED_READS (REP-03) — the rare READ routes that still write an audit row,
// because the act of reading is itself significant: a bulk export is the point
// where data leaves the platform's authorization boundary. Reads are NOT
// audited by default (that would be a log, not an audit trail), so this map is
// deliberately an allow-list, not a coverage requirement — the coverage spec
// only checks that each entry is still a live GET route.
export const AUDITED_READS: Record<string, string> = {
  'GET /reports/:id/export': 'report.export',
};

export const AUDIT_EXEMPT_WRITES: Record<string, string> = {
  'POST /auth/login': 'creates a Redis session only; no business-table mutation (auth-event audit is a separate concern)',
  'POST /auth/logout': 'revokes a Redis session only; no business-table mutation',
  'POST /auth/mfa/enroll': 'stages a pending secret in the Redis session; no business-table mutation',
  'POST /auth/mfa/verify': 'persists mfa_secret to auth_users — a SECURITY event, out of scope for business-data audit; belongs to the future auth-event audit stream',
  'POST /auth/mfa/challenge': 'promotes the Redis session to full; no business-table mutation',
  'POST /notifications/:id/read': "marks the caller's own notification read; a self-service read-state toggle, not a business-data mutation",
  'POST /notifications/read-all': "marks the caller's own notifications read; a self-service read-state toggle, not a business-data mutation",
  'POST /expiry/scan': 'system-wide (cross-client) maintenance trigger; the scan spans all clients so there is no single client scope for the AUDIT-03 tx, and its durable record is the exp_alerts + notifications it raises',
};
