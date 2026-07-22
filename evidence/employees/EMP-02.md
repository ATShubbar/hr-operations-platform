# EMP-02 — Employees API + field-level authorization — Evidence

- Date: 2026-07-21
- Task card: `BACKLOG.md` → EMP-02 (ACTION-PLAN 3.1)
- Status: done
- Commit: `EMP-02: employees API + field-level authorization`

## What shipped — the field-level authorization pattern

The employee record's three sensitivity groups are gated **independently** — a
new pattern: the policy service gates **fields**, not just endpoints.

- **Read redaction** — the response nests `salary` and `govdata`; each is `null`
  unless the caller holds `salary.read` / `govdata.read`. `govdata` supports a
  `full` (staff, incl. identifiers) vs `status` (expiry/status only, reserved
  for the client-rep portal) tier.
- **Write via per-group sub-resource endpoints**, each with its own permission —
  so Finance (no `employee.update`) can still update salary, and GRO can update
  govdata, without a mega-endpoint:
  - `GET /employees`, `GET /employees/:id` — `employee.read` (redacted)
  - `POST /employees` — `employee.create` (salary/govdata blocks inline-gated by
    `salary.update`/`govdata.update`; validates `client_id` via ClientsService)
  - `PATCH /employees/:id` — `employee.update` (core)
  - `PATCH /employees/:id/salary` — `salary.update`
  - `PATCH /employees/:id/govdata` — `govdata.update`
  - `DELETE /employees/:id` — `employee.delete` (soft → `employmentStatus=terminated`)
- **`ROLE_PERMISSIONS` restructured to per-role sets** straight from the matrix
  (each staff role diverges now).
- `@hr/contracts` employee schemas (nested nullable groups); audited (non-sensitive
  snapshot); routes registered in the isolation harness + write-audit registry.

## Per-role grants (architecture matrix — verified by the tests)

| Role | employee | salary | govdata |
|---|---|---|---|
| system_admin | R | R | R |
| company_admin | CRUD | R | R |
| recruiter | R | – | – |
| hr_officer | CRUD | RU | R |
| gro_officer | RU | – | CRUD |
| finance | R | RU | – |
| read_only | R | – | R |

## DoD check

| DoD item | Result |
|---|---|
| Read redaction per role | ✅ recruiter → core only; finance → +salary; GRO/read_only → +govdata; HR → all |
| Write-gating per group | ✅ finance updates salary not govdata/core; GRO updates govdata not salary; HR creates w/ salary; HR create w/ govdata → 403; recruiter create → 403 |
| Soft-delete | ✅ HR terminate → status terminated, row kept; recruiter → 403 |
| Mutations audited; **no sensitive values in audit** | ✅ create/salary-update/govdata-update/terminate present; snapshots contain no `basicSalary`/`iqamaNumber` |
| client_id validated on create | ✅ unknown client → 400 |
| Coverage gates green | ✅ isolation (7 routes), catalog (all `employee/salary/govdata.*`), write-audit (5 mutations) |
| Existing auth tests survive the permission restructure | ✅ auth-policy, auth-me green |
| `lint typecheck test build` green | ✅ turbo 15/15; API **113/113** (+13) |

## Test output (`test/employees-api.e2e-spec.ts`, 13/13)

```
✓ recruiter sees CORE only (salary + govdata redacted)
✓ finance sees CORE + SALARY, not govdata
✓ GRO sees CORE + GOVDATA (incl. identifiers), not salary
✓ HR Officer sees ALL groups
✓ Read Only sees CORE + GOVDATA, not salary
✓ unauthenticated → 401
✓ HR creates with salary → 201  /  HR + govdata → 403  /  recruiter → 403
✓ finance updates SALARY but not GOVDATA or core
✓ GRO updates GOVDATA but not SALARY
✓ HR terminates (soft); recruiter cannot
✓ mutations are audited (create + salary-update + govdata-update + terminate), no sensitive values
```

Full pipeline: `pnpm turbo run lint typecheck test build` → **15/15**, API **113/113**.

## Design decisions recorded

- **Per-group sub-resource endpoints** (`/salary`, `/govdata`) rather than one
  inline-gated PATCH — because the guard gates on a single permission, and
  Finance/GRO hold a group's update capability *without* `employee.update`. This
  also matches the architecture's "a sensitive field group is its own resource".
- **Redaction = nested `null`** (not omission) — a typed, unambiguous contract:
  `salary: null` means "not visible," present object means visible.
- **Audit snapshots are non-sensitive** (core identity + action only) — the
  deferred "before/after redaction" concern, handled here by never logging
  salary/govdata values.

## Deferred (stated)

- **Client-rep read-own-employees** + the `govdata:status` tier → with the
  Client Portal (5.1), like `client.read`.
- Employees **web UI** → EMP-03.
- List pagination — v1 returns all (or `?clientId`-filtered); fine at this scale.
