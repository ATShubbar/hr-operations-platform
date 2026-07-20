# AUTH-04 — Permission catalog + policy service — Evidence

- Date: 2026-07-20
- Task card: `BACKLOG.md` → AUTH-04
- Status: done
- Commit: `AUTH-04: add permission catalog, role mapping, policy service`

## DoD check

| DoD item | Result |
|---|---|
| Staff role holding permission → 200 | ✅ company_admin on /example/greeting |
| Staff role lacking permission → 403 "Permission denied" | ✅ company_admin on /scope-check (client-only capability) |
| Client rep on staff-only permission → 403 | ✅ client_admin on /example/greeting |
| Client rep with client permission → 200 through real RLS scope | ✅ client_admin on /scope-check |
| Catalog coverage red-path | ✅ `bogus.verb` endpoint failed the spec naming `ScopeCheckController.bogus`; reverted, green |
| Fresh-DB migration (role column, default read_only) | ✅ column + `'read_only'::"Role"` default verified |
| Full suite green | ✅ 40/40 (9 suites); lint/typecheck/build PASS |

## Notes

- Authorization is now DATA: `domain/permissions.ts` holds the catalog and
  ROLE_PERMISSIONS; the guard has zero role logic. Adding a capability =
  one permission constant + matrix-row grants + `@RequirePermission`.
- Guard failure semantics complete: 403 no-metadata (misconfigured) ·
  401 unauthenticated · 403 "Permission denied" (policy).
- Catalog↔architecture-matrix parity is a review item until real modules
  land their rows (current grants: exemplar capabilities only).
- Coverage mechanism mirrors the harness philosophy: walk what's LIVE
  (route metadata via ModulesContainer), diff against the declared set.
