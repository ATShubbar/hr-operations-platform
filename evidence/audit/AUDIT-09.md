# AUDIT-09 — The Audit trail names every actor — Evidence

- Date: 2026-10-12
- Status: **done**
- Card approved ("approved for both"). Follow-up filed by SOON-01.
- No ADR: no new permission (the read sits behind the existing `audit.read`), no table.

## The problem

The Audit trail named an actor from the staff directory only. An action by a client manager or
an employee — and by any staff account without a name — showed as an id fragment (`#4a810157`).

## The change

**API — `GET /audit/actors?ids=a,b,c`** (`modules/history/api/audit-actors.controller.ts`)

- Returns `{ actors: [{ id, name }] }` — the id and the display name, nothing else. Never the
  email, role or status (each entry already carries the role it was written with).
- Only ids that **appear in the trail as an actor** are answered
  (`AuditQueryService.actorsAmong`), so it is not a way to look up any account by id.
- An account with no name comes back with `name: null`. An id that never acted, or whose
  account no longer exists, is absent.
- `audit.read` (Administrator, Auditor) and staff only (`scopeOf`). 1 to 100 ids, each a real
  id, or 400.
- Lives in History for the reason the export does: Audit, a foundation module, may not import
  Auth (Auth imports Audit).

**Page — `apps/web/src/app/[locale]/(app)/audit/page.tsx`**

After the staff directory has loaded, the page asks once for the actors on screen that the
directory does not name (also after "Load more"), and shows:

| Account | Shown as |
|---|---|
| Has a name | the name |
| Exists, no name | Unnamed account #4a81 |
| No longer exists | Former account #fb20 |
| Not answered yet, or the lookup failed | the id fragment, as before — it claims nothing |

A failed lookup is retried the next time those entries are on screen.

## Tests — `apps/api/test/audit-actors.e2e-spec.ts`

8 tests, written first; all 8 failed (the route did not exist).

| Red proof | Tests that fail |
|---|---|
| 1 No staff check (a client manager granted `audit.read` gets in) | 1 |
| 2 Answers for any account, whether it acted or not | 2 |
| 3 An extra fact rides along in the response | 2 |
| 4 A deleted account is answered with a null name | 2 |
| 5 Behind `request.read` instead of `audit.read` | 1 |
| 6 No limit of 100 ids | 1 |
| 7 Any text accepted as an id | 1 |
| 8 An actor repeated once per entry | 2 |
| Restored (three files byte-identical, `cmp`) | 8 / 8 |

The route is in the isolation registry (`staff`).

## On screen (local)

Signed in as the client manager and raised a request, then signed in as the Auditor
(temporary authenticator, cleared afterwards: 10 accounts, 0 enrolled).

- **English, desktop.** The two newest rows read "Abdulaziz Al-Ghamdi · Client manager ·
  Created a request / Created a task" — they had read `#4a810157`. Rows written by deleted test
  accounts read "Former account #fb20ce83" (shortened to four characters after this check, see
  below). One lookup request for the page, carrying 8 ids. 0px overflow.
- **Unnamed state.** With the client manager's name removed for the check, the rows read
  "Unnamed account #4a81"; name restored afterwards.
- **Arabic, 375px.** «حساب بلا اسم ‎#4a81» and «حساب سابق ‎#fb20», role beside each, in reading
  order; no label cut off; 0px overflow.

**Caught on screen and fixed:** in Arabic the avatar beside a nameless account was blank. The
label is built with `spaced()`, which in Arabic opens with an invisible direction mark, and the
avatar took that mark as the first letter. The avatar now gets the plain words (`actorOf(e).plain`),
the row gets the assembled line. The id piece was also shortened from eight characters to four so
the label fits a phone row.

The check request and its task were deleted; the database was re-seeded.

## Checks

- API suite **962 / 962** (954 + 8).
- `pnpm turbo run lint typecheck build` — 15 / 15.

## Not included

- The Actor filter still lists staff only, so the trail cannot be narrowed to one client manager
  from the filter. (Stated on the card; not asked for.)
- The audit export already named any account it could; unchanged.
