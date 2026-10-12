# AUDIT-13 — The Actor filter lists client managers and employees — Evidence

- Date: 2026-10-12
- Status: **done**
- Card approved in advance ("approved for all 5"). The small item the owner opened with.

## The problem

The Audit trail's Actor filter listed the staff directory only. A client manager's actions
were in the trail (and, since AUDIT-09, named) but the trail could not be narrowed to them.

## The change

**API — `GET /audit/actors/non-staff`** (beside AUDIT-09's lookup, in
`modules/history/api/audit-actors.controller.ts`)

- Returns the accounts outside the staff directory that appear in the trail as an actor:
  `{ actors: [{ id, name, kind }] }`, `kind` = `client` or `employee`. Never the email.
- Only accounts that acted, and that still exist. Staff are never in it (the directory lists
  them). Sorted by name.
- `audit.read` (Administrator, Auditor), staff only.
- No new permission. The filter itself was already there: `GET /audit?actorId=` takes any
  account.

**Page** — the filter keeps the staff list and adds two headed groups below it, "Client
managers" and "Employees", shown only when they have someone in them.

## Tests — `apps/api/test/audit-actors.e2e-spec.ts` (13 = AUDIT-09's 8 + 5)

Written first; the five new ones and the widened-policy test failed (no route), the "narrow the
trail to that account" one passed already — that part existed.

- a client manager and an employee who acted are listed with name and kind; the keys are
  exactly id, kind, name; no `@` anywhere in the response;
- never listed: staff, a client manager who did nothing, an id whose account is gone;
- an account appears once however many entries it wrote;
- `GET /audit?actorId=` then returns only that account's entries;
- Auditor yes; HR officer, client manager and a signed-out caller no; a client manager
  granted `audit.read` is still refused.

| Red proof | Tests that fail |
|---|---|
| 1 No staff check on the new route | 1 |
| 2 Staff accounts listed too | 2 |
| 3 Accounts that never acted listed | 2 |
| 4 Open to anyone who reads requests | 1 |
| 5 An extra fact rides along | 1 |
| Restored from the staged copy, tree clean after each | 13 / 13 |

The route is in the isolation registry (`staff`).

## On screen (local, Arabic, 375px)

Signed in as the Auditor (temporary authenticator, cleared: 10 accounts, 0 enrolled).

- The filter opened with the staff list and, below it, the heading «مديرو العملاء» over
  "Abdulaziz Al-Ghamdi". No "Employees" heading — no employee account has acted in the local
  trail, and an empty group is not shown.
- Choosing him: the page asked for `audit?limit=50&actorId=4a810157-…`, the filter read his
  name, and all 26 rows shown were his. 0px overflow.

## Checks

- API suite **995 / 995** (990 + 5). `pnpm turbo run lint typecheck build` — 15 / 15.
- Database re-seeded after the suite.

## Stated

- A deleted account cannot be chosen in the filter (it has no name to list); its entries are
  still in the trail, labelled "Former account".
