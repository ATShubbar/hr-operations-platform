# ROLE-03 — The six-role migration — Evidence

- Date: 2026-10-03
- Task card: `BACKLOG.md` → ROLE-03 (ADR-013, architecture.md v1.7)
- Status: done
- Commit: `ROLE-03: six built-in roles, end to end`

## What changed

### Database — `20261003180000_six_roles`

- The `Role` type was **rebuilt**, because Postgres can't drop enum values. The old values
  were mapped in the `USING` clause:

  | Old role(s) | New role |
  |---|---|
  | system_admin, company_admin | administrator |
  | recruiter, finance | hr_officer |
  | read_only | auditor |
  | client_admin, client_user | client_manager |

- **The column default was dropped** (ADR-013). The old default, `read_only`, would have
  become Auditor, which means pay visibility.
- `auth_users_employee_role_chk` was replaced by a stricter **`auth_users_role_principal_chk`**:
  - staff hold only the four staff roles;
  - a client rep holds only `client_manager`;
  - an employee holds only `employee`.
- Dev accounts after `db:deploy`: 2 administrator · 3 hr_officer · 1 gro_officer · 1 auditor ·
  2 client_manager · 1 employee.
- `prisma migrate diff` schema ↔ database: **empty**.

### API

| File | Change |
|---|---|
| `auth/domain/permissions.ts` | `STAFF_ROLES`/`CLIENT_ROLES` → the six. Bundles rewritten to the v1.7 matrix. `report.read` left STAFF_BASE (Administrator + Auditor only). Catalog comments now say what a permission MEANS, not who held it in v1.6 |
| `auth/api/auth.controller.ts` | `MFA_REQUIRED_ROLES` = **administrator, auditor** |
| `documents/domain/document-policy.ts` | administrator/hr_officer → every category. gro_officer → government only (kept, per ADR-013). The recruiter branch is gone |
| `document-expiry/domain/recipients.ts` | Base = administrator + hr_officer. Government documents add gro_officer. **CVs go to HR**, the old recruiter seat |
| `clients/api/client-users.controller.ts` | **Deleted.** `/client-users` (the client-rep path) is retired: client managers hold no `client-user.*`, and staff were already refused there |
| `clients/application/client-users.service.ts` | Role is fixed to `client_manager`. An update is status only. Sessions end on disable |
| `clients/api/client-portal-users.controller.ts` | The only path now. Mapper moved in. Comments updated |
| `@hr/contracts` | `staffUserRoleSchema` → 4 roles. `clientUserRoleSchema` → `['client_manager']`. Create takes no role. **Update is `{status}` only, `.strict()`** (a `role` in the body → 400) |
| `prisma/seed.ts` | One account per **person**, each with their new role, to match the migration. Five task/event owners are kept: `staff-administrator`, `-administrator-2`, `staff-hr_officer`, `-hr_officer-2` (formerly Recruiter), `-hr_officer-3` (formerly Finance), `staff-gro_officer`, `staff-auditor`, `client_manager-a/-b`, `employee-a` |
| Comments in 12 source files | Claims like "System/Company Admin only" or "Recruiter/Finance excluded" are now false and were rewritten. **0 retired role identifiers remain in `apps/api/{src,test}`, `prisma/seed.ts`, `apps/web` or `packages`** (generated Prisma code aside) |

### Web

| File | Change |
|---|---|
| `(app)/portal/users/` | **Deleted.** Its nav entry and location crumb are gone too |
| `staff-users/page.tsx` | Role options → the four |
| `clients/portal-users-dialog.tsx` | No role column, no role select on invite or edit. Edit is status only |
| `messages/{en,ar}.json` | **Three** role-label maps (`roles.*`, `today.role.*`, `staffUsers.role.*`) → the six, with the prototype's casing ("HR officer"). Arabic: مسؤول النظام · أخصائي موارد بشرية · مسؤول علاقات حكومية · مدقّق · مدير العميل · موظف. Unused `portal.users.{role,colRole,colCreated,title,subtitle}` and `nav.portalUsers` removed |

## The matrix, as a test — `test/role-matrix.e2e-spec.ts` (new, 8 tests)

The spec is written like the v1.7 matrix: one row per matrix row, listing each role's
permissions. Each role's bundle must **equal** the union of its entries, so any missing or
extra permission fails. Further checks:

- exactly six roles;
- an explicit list of ADR-013 narrowings;
- **the Auditor writes nothing** apart from its own preferences.

**Proven red:** granting `report.read` to `hr_officer` → 2 failures, with `extra: ["report.read"]`
named. Reverted, green again.

## Every widening and narrowing, asserted where it bites

| Spec | v1.7 assertion |
|---|---|
| `employees-api` | GRO sees core + gov data, not pay. **The Auditor sees pay** (Read Only did not). HR **creates with gov data** (was 403). GRO cannot update the core profile. **Only the Administrator terminates.** HR and GRO get 403 |
| `recruitment-candidates-api`, `-vacancies-api` | **GRO reads hiring** (was 403) and updates, but cannot create, approve or delete. **Delete is the Administrator's**: HR gets 403 |
| `gro-processes-api` | The Auditor reads but cannot create or advance |
| `calendar-api` | Every staff role reads others' events. **GRO edits and deletes another's event.** The Auditor gets 403 on every write. The Auditor's view carries every source |
| `reports-api` | Administrator and Auditor see all six. **HR and GRO get 403** on `/reports`. See the gate test below |
| `reports-export` | Only the Administrator exports. The Auditor reads, and its export is 403 with no audit row |
| `requests-api` | **A client manager cannot edit a request**, own or another company's (403). It was 200/404 |
| `documents-api`, `documents-read` | HR uploads CVs and government docs alike. GRO cannot delete (no `document.delete`). The Auditor gets 403 on upload and delete |
| `expiry-scan` | CV alerts go to HR, not GRO and not the Auditor |
| `self-service-accounts` | GRO, client rep and employee → 403. **The Auditor reads an account, cannot invite.** A client manager deactivated by an Administrator over the staff path, or disabled by status change → 401 at once. Termination now runs as the Administrator |
| `client-portal-users` | Administrator CRUD at A and B. **The Auditor reads, cannot write.** HR, GRO and a client manager → 403. A `role` in PATCH → 400. **`/client-users` → 404** for everyone |
| `staff-users` | The matrix row's "R" is now the Auditor (was Company Admin) |
| `audit/audit-read` | The Auditor reads the audit log |
| `auth-employee-principal` | The new CHECK refuses staff holding `client_manager` and a client rep holding `administrator` |
| `auth-me` | A client manager has `portal.read`/`request.create`, and **no `client-user.*`** |

### The per-report gate, still proven

No v1.7 role exercises `requiredPermissions`, because both report readers read all data. So a
second describe in `reports-api` overrides `PolicyService` to withhold `salary.read` from the
Auditor:

- `payroll-cost` is then unlisted;
- running it gives 403 naming `salary.read`;
- `workforce` still runs.

**Proven red:** with `canRun` forced to `true`, that test fails (1 failed / 6 passed).
Restored.

## Suite

| Run | Result |
|---|---|
| 1 (before test rework) | 438/483, the expected re-pin failures |
| 2 | **483/483** |
| 3 | **483/483** |
| 4 | 476 + 7 skipped: `portal-employees` `beforeAll` sign-in got **405 Method Not Allowed** |
| 5 | **483/483** |

Run 4 is not a role failure. Nest never answers 405, so this is the documented supertest
ephemeral-port flake: the request reached another listener. That spec alone passed 3/3
immediately after. The REP-04 harness fix is still open (spawned earlier).

API typecheck and lint are clean. The isolation registry dropped the 5 `/client-users`
entries, the audit registry dropped 3.

## Live verification (dev servers restarted)

| Principal | Result |
|---|---|
| hr_officer (Omar) | 45 permissions. Nav: Overview…Hiring, Clients · Documents, Expiry, GRO, **Candidates**, Google Calendar · **no Reports, no Audit trail**. `/en/reports` and `/en/audit` show the restricted state naming `report.read` / `audit.read`. On an employee record: 3 Edit (core, salary, **gov data**) + Invite, **no Terminate**. Footer «أخصائي موارد بشرية» in Arabic |
| gro_officer (Turki) | 32 permissions. Nav includes **Hiring and Candidates** (previously excluded). `/ar/vacancies` and `/ar/candidates` load. 0px overflow at 375 |
| administrator (Faisal) | Two-factor enrolled for the check. 67 permissions. Full nav incl. Roles and permissions, Reports, Audit trail. `/ar/staff-users`: role cells and the add-dialog options are exactly the four Arabic labels, footer «مسؤول النظام». Clients → Portal users dialog: columns **Email · Status**, invite fields **Email · Initial password**, **0 role selects** |
| auditor (Sami) | Two-factor enrolled for the check. 26 permissions. Nav incl. Reports + Audit trail, **no Google Calendar**. `/reports` lists all six. `/audit`, `/requests`, `/employees` load with **no create or row-action buttons** |
| client_manager-a | 12 permissions. Lands on `/portal/company`. Nav: My company, My employees, My documents, Settings (**no Portal users**). Arabic portal at 375: 0px overflow |
| employee-a | 6 permissions. `/me`, nav: My file, My requests, My leave. Unchanged |

Web `typecheck` and `lint` are clean. **`next build` succeeds**: 63 pages; the
`/portal/users` pages are gone. The dev server was stopped for the build and restarted after.

## Cleanup and operational note

- Both test two-factor secrets were cleared afterwards (0 seed users enrolled), and sessions
  signed out.
- **Sessions cache the role.** The dev Redis still holds sessions carrying retired role names.
  The policy denies an unknown role everything, so they fail closed, and the re-seed replaced
  those users anyway. **In any environment with real users, this migration must be followed by
  ending all sessions.** None exists today: nothing is provisioned.

## Found, not fixed

- **The Employee column's "Notification preferences: U (own)"** has never been granted.
  `notification-pref.update` is absent from the employee bundle (ADR-011 rev. 3). Recorded in
  ADR-013 rev. 1 and pinned as-is in the matrix spec.
- ADR-013 listed "Client Admin loses document upload". In code, **no client role ever held
  `document.upload`**, so nothing changed there.
- `/today-preview` (untracked, still awaiting your decision) still reads `today.role.*`,
  which now holds the six labels.

## Correction to the decision record

**The matrix's Calendar cell for HR and GRO** ("CRUD (own) + R (all)") cannot be expressed:
`calendar.read-all` lifts update and delete along with read (CAL-02). Both officers follow the
prototype's `calendar: RWCD` instead, which is CRUD on every event. Recorded as **ADR-013
rev. 1** and in the architecture.md v1.7 changelog. The cell now reads CRUD.
