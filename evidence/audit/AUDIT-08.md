# AUDIT-08 — The Audit trail's "Records" category shows every record type — Evidence

- Date: 2026-10-11
- Status: **done**
- Card approved ("approved for all 3").

## The fault

The Audit trail groups entries into categories (Access, Permissions, Procedure, Request, Data export, Integration, Records). An entry's own pill already said "Records" for any type no other category claims. The **filter** did not: it sent a fixed list of record types, written when the screen was built. Every type added since (dependants, onboarding sequences, leave, fees, invoices, billing terms, request comments and files…) was missing from that list. Choosing "Records" hid them.

## The fix

"Records" now means what its pill always meant: **everything no other category claims**.

- `packages/contracts/src/audit.ts` — the list query accepts `notResources` (a list of record types to leave out), validated exactly like `resources` (1–50 names, each 1–100 characters).
- `apps/api/src/modules/audit/application/audit-query.service.ts` — `whereFor` applies it. The conditions are combined, so it works together with search, an include list and the severity filter. The list and the export share `whereFor`, so the export follows the same filter.
- `apps/web/src/lib/audit-category.ts` — `filterOf(category)` returns an include list for a named category and an **exclude** list (the types the other categories claim) for Records. Payroll still claims nothing and stays disabled ("coming soon").
- `apps/web/src/app/[locale]/(app)/audit/page.tsx` — sends whichever list `filterOf` returns.

A record type added tomorrow lands in Records with no change to either side, until someone gives it a category.

## Tests

`apps/api/test/audit-categories.e2e-spec.ts` (4), written first.

| Run | Result |
|---|---|
| Before the change | **4 failed** |
| After | 4 passed |

Each rule was then broken to see a test fail, and the file restored byte for byte:

| # | Broken | Failed as expected |
|---|---|---|
| 1 | The exclusion is ignored | yes |
| 2 | The exclusion replaces an include list instead of combining with it | yes |
| 3 | The list is not validated (empty or oversized accepted) | yes |

Full API suite: **861/861** (852 + these 4 + PROF-07's 5). Web typecheck, lint and production build clean.

## On screen (local, as Administrator)

- The Category menu lists the nine options; Payroll is disabled.
- Choosing **Records** sends `notResources=auth-account,client-user,employee-user,staff-user,gro-process,request,task,report,gcal-invitation` and no include list.
- Counts under Records against the database:

| Search | Screen | Database |
|---|---|---|
| fee | 4 (all `fee`) | 4 |
| invoice | 7 (all `invoice`) | 7 |
| billing | 2 (all `billing-terms`) | 2 |

- Searching "request" under Records returns only request comments and request files; no `request` entry (that type belongs to the Request category).
- The first 100 entries under Records held nine types (leave, onboarding sequences, request comments, search, leave balances, employee, client, vacancy, notification preferences) and none of the nine claimed elsewhere.

The administrator account's authenticator was enrolled for this check and cleared afterwards (10 seed accounts, 0 enrolled).

## Not done

- The category map still lives in the web app. The server only learned to leave types out; it does not know the categories. That is enough for the filter to be right, and it keeps one copy of the map.
- Not checked in Arabic or at phone width: no text or layout changed.
