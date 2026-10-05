# DEP-02 — The dependants API — Evidence

- Date: 2026-10-05
- Status: **done**. API only; the screen is DEP-03.
- Decision: ADR-017. Card approved by the owner.

## What changed

| File | Change |
|---|---|
| `packages/contracts/src/dependant.ts` (+ index) | Write schemas are **strict** (`z.strictObject`; unknown keys give 400). Dates are **date-only** strings that must be real (`2026-02-30` is refused), converted to UTC midnight. The iqama number must be `^2\d{9}$`. Relationship is spouse, son or daughter; the English name is required and trimmed. An update must change something. Response schemas: staff (`employeeId`, `iqamaNumber`, `identifierVisible`) and self (no sponsor id, no `identifierVisible`). |
| `employees/api/dependants.controller.ts` (NEW) | `GET /employees/:id/dependants` (`employee.read`), `POST …` / `PATCH …/:dependantId` / `POST …/:dependantId/remove` → 204 (`govdata.update`). **Staff only**: `scopeOf`, so an employee gets 403, and a client rep's client scope also gets 403. Malformed or unknown ids give 404. The iqama number is shown only to `govdata.read` holders. |
| `employees/domain/dependant-view.ts` (NEW) | `toDependantResponse` / `toSelfDependant`: field-by-field whitelists; dates as `YYYY-MM-DD`; no timestamps or removal stamps. |
| `self-service/api/self-service.controller.ts` | `GET /me/dependants` (`self-service.read`). Same `ownRecord()` gates as the rest of `/me` (the company switch, a live record). Read through `listForSelf` on the employee-only connection. |
| `employees.module.ts`, `public-api.ts` | Controller registered; `toSelfDependant` exported for Self-service. |
| `test/isolation/endpoint-registry.ts` | 4 routes as `staff`, `GET /me/dependants` as `employee`. |
| `test/isolation/isolation.e2e-spec.ts` | Fixture dependants **named with their sponsor's id**, so the harness's own-vs-colleague check works on the list (removed via the owner connection: staff hold no DELETE). |
| `test/audit/audited-writes.ts` | 3 writes: `dependant.create`, `dependant.update`, `dependant.remove`. |

## Tests: `test/dependants-api.e2e-spec.ts`, 10/10

- **The three staff roles that change:**
  - the GRO officer adds (201), the HR officer edits (200), the Administrator removes (204);
  - response keys are asserted **exactly**;
  - dates round-trip as `YYYY-MM-DD`;
  - a removed dependant is gone from the list, and editing or removing it again gives 409.
- **Auditor:** reads; POST, PATCH and remove all give 403.
- **Client manager and employee:** 403 on every staff route.
- **Validation (400):** an unknown key (`employeeId`, `removedAt`), an iqama not starting with 2, a short iqama, an unreal date, a timestamp instead of a date, `father`, a blank name, an empty patch.
- **Addressing (404):** unknown sponsor on POST and GET; malformed ids; another sponsor's dependant on PATCH and remove.
- **Audit:** create, update and remove each write their entry against the sponsor.
- **`/me/dependants`:** own family with numbers, keys exactly `SELF_KEYS`, a colleague's family absent and vice versa. Removed dependants are left out. The company switch off gives 403. Staff and client managers get 403; anonymous gets 401.
- **Narrowed policy** (HR officer without `govdata.read`): the family is returned with `iqamaNumber: null` and `identifierVisible: false`, and the number is absent from the body. The GRO officer in the same app still sees it.
- **Widened policy** (a client manager granted `employee.read` + `govdata.update`): still 403 on all four staff routes, and nothing is written. Without this test the staff-only check was **not** load-bearing: no v1.7 client role holds those permissions, so removing the check left all 9 earlier tests green. The test was added for that reason.
- **Isolation harness:** `GET /me/dependants` gets own-record, same-company colleague and 401 checks. The coverage spec matches the route map; write coverage passes.

## Red proofs (each broken, its test fails, then restored byte-identical)

| Broken | Failed |
|---|---|
| Iqama mask disabled (`identifierVisible()` → `true`) | the narrowed-policy test |
| Staff whitelist widened (`createdAt` added) | the exact-keys test |
| Self view carries `employeeId` | the `/me` exact-keys test |
| Self read moved to the **staff** connection (no database fence) | **3 tests**: `/me` own-only, the harness's colleague probe, DEP-01's employee-fence test |
| Staff-only check removed | the widened-policy test |

The first attempt at the database-fence proof did not apply, because prettier had re-wrapped the line and `sed` matched nothing (`grep -c` printed 0, all green). It was redone with an exact-text replacement; the table above records the real run.

## Gates

- **Full API suite 700/700, twice.**
- Contracts tests pass; api `typecheck` + `lint` clean; web `typecheck` clean against the rebuilt contracts. Prettier applied with the shared config.
- Re-seeded after the suite.

## Live (dev API restarted for the new controller; seed data)

| Caller | Result |
|---|---|
| GRO officer → `GET /employees/<Rajesh Kumar>/dependants` | 200. Anitha (spouse, iqama 2400000301, expired), Maryam (daughter, born 2014), Faris (son, born 2024, **no iqama yet**: `null`). Order: spouse, then children oldest first. `identifierVisible: true`. |
| Client manager B (Rajesh's own company) → same route | **403** |
| Employee (Ahmed Hassan) → `GET /me/dependants` | 200. Yasmin (spouse) and Omar (son), numbers included, iqama expiry 2026-11-19 (45 days out); no `employeeId` or `identifierVisible` keys. |
| Same employee → `GET /employees/<Ahmed>/dependants` | **403** |
