# AUTH-06 — MFA (TOTP) — Evidence

- Date: 2026-07-20
- Task card: `BACKLOG.md` → AUTH-06
- Status: done
- Commit: `AUTH-06: add TOTP MFA, required for admin roles`

## DoD check

| DoD item | Result |
|---|---|
| Full enroll→verify→challenge cycle with REAL codes | ✅ e2e generates live TOTP codes; wrong code → 401; valid code upgrades to full session |
| Admin-must-enroll enforced (ADR-002) | ✅ company_admin login → limited session (401 everywhere), can enroll+verify, then full access |
| Non-admin without MFA unchanged | ✅ recruiter logs in fully |
| Enrolled user re-login requires challenge | ✅ mfaRequired:true, pending cookie 401 on protected endpoints |
| Double-enroll rejected | ✅ 400 once active |
| Suite green | ✅ 47/47 (11 suites); lint/typecheck/build PASS |

## Design decisions recorded

- Session `mfa` state machine: `full` / `enroll_required` / `challenge`.
  Only `full` sessions authenticate (middleware); limited sessions are
  short-lived (5 min TTL) and usable ONLY on the self-checking MFA
  endpoints — new `session` registry class probes them for
  unauthenticated→401.
- Secret is held in the pending session during enrollment and written to
  `auth_users.mfa_secret` ONLY after a successful verify — no unverified
  secrets at rest. Column-level encryption of the secret is a recorded
  future hardening.
- Test helper default staff role changed company_admin → hr_officer
  (admins now legitimately start limited — exactly the architecture's
  requirement).

## Landmines hit (recorded in CLAUDE.md class of knowledge)

- **otplib v13 is a full API rewrite**: no `authenticator` export;
  functional `generateSecret/generateSync/generateURI/verifySync`, and
  tolerance is `epochTolerance` in SECONDS (30 = ±1 classic step) —
  probed live against the installed package before writing the service.
- Boundary lint caught the spec deep-importing MfaService — exported via
  public-api instead. The mechanism polices its author.
