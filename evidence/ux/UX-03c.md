# UX-03c — the DataTable sweep — Evidence

- Date: 2026-07-25
- Task card: `BACKLOG.md` → UX-03c
- Status: done
- Commit: `UX-03c: sweep the remaining lists onto DataTable`

## What shipped

**Nine lists migrated** (the card said eight — `/integrations` was a real list
neither card had counted, and the stated end state was false without it):

| Screen | Filters preserved | Row actions preserved | Verified as |
|---|---|---|---|
| Clients | — | edit / archive (gated) | hr_officer |
| Documents | client, category, expiring-before | download / delete | hr_officer |
| Requests | client, status | process (gated) | hr_officer |
| Tasks | status, client | assign-to-me / edit (gated) | gro_officer |
| GRO | client (server), status (client-side) | change status (gated) | gro_officer |
| Vacancies | client (server), status (client-side) | status Select (gated) | recruiter |
| Integrations | — | inspect / cancel | gro_officer |
| Portal employees | — | — | client_admin |
| Portal documents | — | download | client_admin |

Every list in the app is now on `DataTable` **except `/audit`** — plus `/expiry`
and `/reports`, which are a bucketed dashboard and a generic report renderer
rather than lists of domain records.

### Audit stays off it, on purpose

`/audit` is the one genuinely **server-paged** list: `limit` + `beforeId`, a
`nextCursor`, and "load more". `DataTable` filters and sorts a complete array in
memory, so migrating it would either regress paging or — worse — leave a search
box that searches **only the rows fetched so far** and reports "no results" for
entries that exist. That is the same failure mode as the Arabic search: it looks
like it worked. Audit migrates when the component gets a real server-side mode,
which needs a second server-paged consumer to justify.

## The component change this sweep forced

`DataTable` decided empty-vs-no-results from its own search box alone. Five of
these screens filter **server-side**, so a filtered-to-nothing result was
indistinguishable from an empty table — and would have shown the first-run copy
with an **upload/create CTA to someone who had just filtered**, which is the
precise anti-pattern UX-03 set out to kill.

Added `filtersActive` so a screen can declare that something outside the
component is narrowing `rows`. Measured on Documents, filtering to
`expiring before 2020-01-01`:

```
rows: 0
shown: "لا نتائج مطابقة … إزالة التصفية"   ← no-results + a way out
```

and the clear button resets the **server** filter and refetches (date input back
to empty, 3 rows restored). Surfaced rather than worked around, as the card said
I would.

## Live verification

Driven as a user against the dev server, per screen and per role.

### Arabic search — the reason `@hr/text` exists — on migrated screens

| Screen | Typed | Naive `includes()` | With the normaliser |
|---|---|---|---|
| Requests | `شركة الالف` (hamza dropped) vs `شركة الألف التجارية` | **false** | **2 rows** |
| GRO | `احمد` vs `أحمد حسن` | **false** | **2 rows** |

### Sorting

- Requests: title asc → desc reorders correctly, `aria-sort` follows and only one
  column carries it.
- GRO due-date descending → Sep 10, Aug 25, Aug 15. The Hijri month name is
  identical across all three rows, so this is only correct because the column
  sorts the **raw ISO date**, not the rendered dual-calendar string.
- Vacancies headcount is `numeric`, computed `text-align: end`.

### Permission gating — the risk called out in the card

- **Clients as hr_officer: 2 headers, not 3.** No `client.update`/`delete`, so
  there is no actions column at all — not an empty one with a header.
- Requests `process`, GRO `change status`, Vacancies status-Select all appear
  only for the roles that hold the capability (verified by logging in as each).
- Tasks: both seeded tasks belong to gro_officer, and "assign to me" is correctly
  **absent** on tasks already theirs while "edit" shows.
- Portal employees still **redacts**: no salary, no identifier numbers in the
  payload (regex-checked the rendered page, not just eyeballed).

### Content that had to survive

Tasks' `(من طلب)` request-origin marker, GRO's resulting-expiry column,
Integrations' guardrail banner and its "what leaves the system" inspect action,
the portal download action. All present.

### Both locales

`/en/gro` renders `Employee / Type / Status / Due date / Reference / Resulting
expiry`, `dir=ltr`, English placeholder, `Rabiʻ I 2, 1448 AH · August 15, 2026`.
Everything else was driven in Arabic (the default).

## Two colour decisions folded in

Both screens had a hand-rolled `Badge` variant, which is what UX-02's tone table
exists to replace, so they needed a mapping rather than a local guess:

- **`client`** — `active: ok`, `inactive: neutral`. An archived client is not a
  fault, it is simply not current.
- **`invitation`** — `scheduled: ok`, `cancelled: **neutral**`. It was
  `destructive`, which read as "something went wrong" for an action that
  succeeded.

`STATUS_VARIANT` maps died with the migration in Requests, Tasks, GRO and
Vacancies — including Requests', which painted `resolved` solid and `closed`
outline for two states that both mean finished. That inconsistency was exactly
the audit finding behind the one-table rule.

## Dev-data hygiene

- Created one Google Calendar invitation through the UI to verify the
  Integrations row (there were none), cancelled it to check the neutral tone,
  then **deleted it** — `int_gcal_invitations` back to 0 rows.
- The client portal is flag-gated and the flag was unset, so the portal tables
  could not render. Enabled `flag.client-self-service` for client A, verified,
  then **deleted the row** — `cfg_client_settings` back to 0 rows.

## Commands

```
pnpm turbo run lint typecheck build   # 15/15 tasks
```

No API change; no test change.

## Files

- 9 page files migrated (`clients`, `documents`, `requests`, `tasks`, `gro`,
  `vacancies`, `integrations`, `portal/employees`, `portal/documents`)
- `components/ui/data-table.tsx` (`filtersActive`; `isFiltered` → `narrowed`)
- `lib/status-tone.ts` (`client` + `invitation` domains)
- `messages/{en,ar}.json` (9 × `searchPlaceholder`)

## Next

UX-06 (states across the screens — skeleton/empty/error-with-retry/403; several
screens still render a bare `<p className="text-destructive">` for errors), or
UX-09 (the `SelectValue` raw-value leak + unifying the workflow controls, which
the Vacancies status-Select in a row action is a live example of).
