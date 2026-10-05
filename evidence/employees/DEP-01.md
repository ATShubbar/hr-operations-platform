# DEP-01 — The dependants table, its database fences and an audited service — Evidence

- Date: 2026-10-05
- Status: **done**. API only, with no HTTP route yet (DEP-02), so nothing is visible in the browser.
- Decision: ADR-017 (DEP-00). Card approved by the owner.

## What changed

| File | Change |
|---|---|
| `prisma/schema.prisma` + `migrations/20261005120000_dependants` | `emp_dependants` + enum `DependantRelationship` (spouse · son · daughter). Fields: `employee_id` (the sponsor, a bare reference), `name_en`, `name_ar`, `date_of_birth`, `iqama_number`, iqama/passport/insurance expiry dates, `removed_at` + `removed_by_user_id`, timestamps. Index on `employee_id`. **No `client_id`** (ADR-017). CHECKs: a non-blank English name, and `removed_at` ⇔ `removed_by_user_id`. |
| (same migration) | **Grants:** `app_staff` SELECT/INSERT/UPDATE, **no DELETE**. `app_employee` SELECT. **`app_client` nothing.** **RLS:** `staff_full_access` + `employee_self` (the SPIKE-001 `NULLIF` form). |
| `employees/application/dependants.service.ts` | `listFor` (live rows; spouse first, then children oldest first, then by when added). `listForSelf` (through `EmployeeScopedPrismaService`, so the database picks the rows). `add`, `update`, `remove` (soft). Each change is audited in the same transaction as `dependant` against the **sponsor** (`resource_id` = employee, `client_id` = their company) with a **non-sensitive** snapshot: id, relationship and name; on update, the NAMES of changed fields, never their values. 404 for an unknown sponsor or a dependant of another sponsor; 409 for a removed dependant; 400 for a blank name. |
| `employees/domain/dependant.ts`, `public-api.ts`, `employees.module.ts` | `DependantInput` / `DependantPatch`; the service is provided and exported. |
| `audit/domain/severity.ts` | `dependant` (every action) is **notable**, like `govdata.update` (ADR-017). The severity spec lists the three actions. |
| `prisma/seed.ts` | **6 dependants** on three sponsors, dated relative to seed time. Ahmed Hassan (the employee login): wife + son, iqama in **45 days** (inside Renew's 90). Syed Ali: wife, 210 days. Rajesh Kumar: wife + daughter **expired 6 days ago**, and a son with no iqama yet. Upserted back to live on every run, and idempotent (seeded twice, still 6 rows). |
| `modules/README.md` | Checklist note: a table no company-scoped role reads needs no `client_id`; don't copy one that can go stale; withhold DELETE where history refers to rows. |

## Tests: `test/dependants.e2e-spec.ts`, 11/11

The service:
- **add**: listed; audit against the sponsor with the company; the iqama number is NOT in the entry; severity notable.
- **ordering**: wife, elder, younger.
- **refusals**: unknown sponsor gives 404; blank name gives 400.
- **edit**: the audit's `changed` is exactly `['iqamaNumber', 'passportExpiry']`, and neither value appears in before/after.
- **remove**: off the list, still in the table with who removed it, one `remove` audit entry; then edit and remove again are both 409.
- **wrong sponsor**: a dependant addressed through another employee's id gives 404 for both edit and remove.

The database fences:
- **Employee reads:** an unfiltered query as one employee returns only their rows; a colleague's and an outsider's are invisible; `listForSelf` agrees with the staff list.
- **Unscoped employee session:** 0 rows.
- **Employee writes:** both an INSERT and an UPDATE are refused.
- **Client managers:** `permission denied`.
- **Staff connection DELETE:** `permission denied`, and the row is still there.

## Red proofs (each fence loosened, its test fails, then restored)

| Loosened | Result |
|---|---|
| `employee_self` → `USING (true)` | 2 failed: own-rows-only, unscoped-sees-nothing |
| `app_client` granted SELECT + an open policy | 1 failed: client managers have no access |
| `app_staff` granted DELETE | 1 failed: nobody hard-deletes |
| `app_employee` granted INSERT/UPDATE + an open policy | 3 failed, including **an employee can write nothing** |
| Audit snapshot includes `iqamaNumber` | 2 failed: add + edit audit tests |
| Own-sponsor check dropped (`before.employeeId !== employeeId`) | 1 failed: a dependant only through its own sponsor |

After restoring:
- 11/11 pass.
- The service file is byte-identical to its backup (`cmp`).
- The grants and policies, read back from `information_schema` and `pg_policies`, are exactly the migration's: `app_employee` SELECT; `app_staff` INSERT, SELECT, UPDATE; `staff_full_access` and `employee_self` only.

## Gates

- Before the new spec existed in code: it failed (no provider, no table).
- **Full API suite 687/687, three times**: twice before a typing fix (no behaviour change), once after.
- api `typecheck` + `lint` clean; prettier applied with the shared config.
- Re-seeded after the suite.

## Notes

- The audit trail never holds a dependant's iqama number or dates. This matches EmployeesService, whose snapshots leave govdata values out. AUDIT-07's "full before/after" export therefore contains no identifiers for dependants.
- No HTTP route exists yet, so the isolation harness has nothing to register. DEP-02 adds the staff routes and the employee read, each with the same-company colleague probe.
