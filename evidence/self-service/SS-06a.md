# SS-06a — Employee accounts: invitation, first password, reset, deactivation — Evidence

- Date: 2026-10-03
- Task card: `BACKLOG.md` → SS-06a (SS-06 split approved: **06a API** here, **06b web** next)
- Status: done
- Commit: `SS-06a: employee accounts, and deactivation that actually ends sessions`
- Scope: API + contracts + env. No web change (SS-06b).

## The gap found before the card (pre-existing, every account type)

Measured live, before any code: a seed client user signed in, was disabled in the database,
and **kept working on the same session** — `/auth/me` 200, `GET /requests` 200 — while a fresh
login was refused. Sessions lived in Redis with no per-user index, and nothing ended them on
deactivation, so a disabled account worked for the rest of the 12-hour session. Affected:
staff deactivation (UX-10b), client-user deactivation (CLIENT-03) — and would have made
"deactivate on termination" cosmetic. A **role change** had the same flaw (the session caches
the role, so a demotion waited for re-login); fixed in the same lines and stated as a small
scope addition.

(The first attempt at that measurement used a non-existent address — login 401, "restored"
row empty — and was discarded rather than reported.)

## What changed

| Area | Change |
|---|---|
| `auth/application/sessions.service.ts` | per-user index `user-sess:{userId}` written with each session (MULTI); `destroy` removes the index entry; **`destroyAllForUser(userId)`** |
| `auth/application/staff-users.service.ts` | `update` ends sessions on disable **or role change**; `deactivate` ends sessions (even on the already-disabled no-op path) |
| `clients/application/client-users.service.ts` | same for client users (`update` on disable/role change, `deactivate`) |
| Migration `20261003160000_account_tokens` | `UserStatus` + `invited`; `auth_users.password_set_at` (backfilled from `created_at` — all 10 existing accounts had passwords); `auth_account_tokens` (purpose `invite`/`reset`, user FK cascade, **`token_hash` unique**, expires, used); staff-only grant, no RLS (a system table, like `auth_users`) |
| `auth/application/account-tokens.service.ts` (new) | 32-byte base64url tokens, **SHA-256 stored**; `issue` (expires older unused of the same purpose), `consume` (conditional on `usedAt IS NULL` — single use under a race), `revokeAll`, `countIssuedSince` |
| `auth/application/users.service.ts` | `passwordSetAt` on every password-bearing create; `findByEmployeeId`, `createInvitedEmployeeUser`, `updateEmail`, `setPassword`, `setStatus` |
| `auth/api/auth.controller.ts` | `POST /auth/account/set-password` (@Public; token is the credential): claim + set password + invited→active + audit in ONE transaction, then **every session ends**; one generic 400 for any unusable link; no session created |
| `notifications/application/account-email.service.ts` (new) | account mail through the SAME `EMAIL_TRANSPORT` seam; the transport is now ONE instance per process, provided by `NotificationsModule` and reused by the worker |
| `employees/domain/employee-terminated.event.ts` (new) + `employees.service.ts` | `EmployeeTerminatedEvent` published after commit on any transition INTO `terminated` |
| `self-service/application/employee-accounts.service.ts` (new) | invite / re-invite, status (deactivate ends sessions + cancels links; reactivate → `active` if a password was ever set, else `invited`), reset request (employee accounts only, 3/hour), close-on-termination |
| `self-service/api/employee-accounts.controller.ts` (new) | `GET /employee-accounts/:employeeId`, `POST …/invite`, `PATCH …` (`employee-user.read/invite/update`) |
| `self-service/api/password-reset.controller.ts` (new) | `POST /me/password-reset` (@Public, **always 202 `{}`**) |
| `self-service/application/employee-terminated.handler.ts` (new) | `@OnEvent(employee.terminated)` → close the account |
| `self-service/domain/account-email.ts` (new) | ar/en invitation + reset text; link `…/{lang}/account/set-password#token=…` — **fragment, not query** (never sent to a server, so not in logs or Referer) |
| `auth/domain/permissions.ts` | `employee-user.read/invite/update` → Company Admin + HR Officer |
| `@hr/contracts` | `setPasswordRequestSchema` (strict; password 10–200); invite / account / update / reset schemas |
| Env | `APP_WEB_ORIGIN` in `.env.example`, `apps/api/.env`, `turbo.json` globalEnv, `ci.yml` |
| Registries | isolation: 3 `staff` routes + 2 `public`; audit: invite → `employee-user.invite`, PATCH → `employee-user.update`, set-password → `auth-account.activate`; `POST /me/password-reset` EXEMPT (issues a token only; completion is audited) |

## Found by the first runs

1. **Test addresses had upper-case letters** (`SS-06a`) while the API stores addresses
   lower-cased — the capture lookup missed every mail. Test fixed; the normalisation is the
   intended behaviour.
2. **The reset throttle did not throttle** — a real bug. `issue()` DELETED older unused tokens,
   so "issued in the last hour" never exceeded 1 and the 4th request still mailed. Superseded
   and revoked tokens are now **expired** (`expiresAt = now`) instead: they stop working just
   the same, but stay countable — and the history is kept.

## Verification

### `test/self-service-accounts.e2e-spec.ts` — 20/20

| Area | Result |
|---|---|
| **Revocation, client user** | deactivated by their Client Admin → the open session **401 at once**; a ROLE change → 401 |
| **Revocation, staff** | System Admin disables / demotes / deactivates → each victim's session **401**; a display-name change leaves the session alone |
| **Revocation, employee** | deactivated by staff → 401; cannot sign in again |
| invite flow | 200 `{invited, passwordSet:false, emailSent:true}`; ONE mail, Arabic, link `/ar/account/set-password#token=` and no `?token=`; login refused while invited; set password → login → `/auth/me` is the employee; account `active, passwordSet:true` |
| token storage | one row; `token_hash` is 64 hex chars and does not contain the token |
| token rules | used once → second use 400; expired → 400; **re-invite: old link 400, new link 200**; short password / unknown token → 400 |
| invite refusals | company not opted in 409 · terminated 409 · already active 409 · address in use 409 · unknown employee 404 |
| who may manage | recruiter, client rep, employee → 403 (invite + read) |
| reset | active employee: link works, new password works, **old password and old session fail**; unknown address / staff address / garbage → identical 202 `{}` and **no mail**; 4 requests → 1 invite + 3 reset mails (the 4th sent nothing) |
| **termination** | DELETE /employees/:id (HR) → the employee's session **401 at once**; account `disabled`; reactivation refused 409 while terminated |
| deactivate/reactivate | deactivating an INVITED account kills its link; reactivating → `invited`; an account whose holder set a password → `active` and can sign in |
| audit | exactly `employee-user.invite` + `auth-account.activate` for the flow; the token appears nowhere in the audit rows |

**Proven to bite:** removing `destroyAllForUser` from client-user deactivation → the test fails
with **`expected 401, got 200`** — the original gap, reproduced exactly; restored → green.

### Full suite — 475/475, three consecutive runs

475 = 455 + 20. All existing auth / staff-user / client-user / notification-email / queue specs
pass with the single-transport change and the revocation calls.

### Live (dev API — restarted, see landmine)

```
employee-a login 200 · /auth/me 200
HR PATCH /employee-accounts/{Ahmed Hassan} {disabled} → {"status":"disabled","passwordSet":true}
SAME employee session /auth/me → 401          ← was 200 before this card
HR PATCH {active} → {"status":"active"} · fresh login 200     (dev data restored)
[flag on for client A]
HR POST /employee-accounts/{Mohammed Alabdullah}/invite → {"status":"invited","passwordSet":false,"emailSent":true}
  account: invited, password_set=false · token: invite, hash_len=64, expires in 7 days
  dev log: email → ss06a-live@example.com: دعوة إلى ملفك في PEOPLE&GRO
POST /me/password-reset {nobody@example.com} → 202
[cleanup: the invited account (tokens cascade) and the flag deleted]
```

### Gates

API typecheck + lint clean; contracts built; new files formatted with the shared config.

## Found, not fixed

- **The running dev API did not pick up the new routes** (`Cannot PATCH /employee-accounts/…`,
  404) although `nest start --watch` had reloaded for SS-03..05 — restarting it fixed it. Recorded
  as a landmine.
- **e2e notification jobs are delivered by the running dev server's worker**: the suite and the
  dev server share one Redis queue, so the dev log fills with `email → e2e-helper-…` lines while
  tests run. Pre-existing (NOTIF-01 era); harmless locally, but test runs and a dev server should
  not share a queue — e.g. a per-run queue prefix.

## Still open (unchanged by this card)

**Production email is not configured** — the whole flow is proven against the dev capture only.
Real employees cannot be onboarded until an SMTP transport is bound to `EMAIL_TRANSPORT` (the
GCP/infra track).
