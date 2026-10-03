# AUDIT-06 — A record's own history — Evidence

- Date: 2026-10-04
- Task card: `BACKLOG.md` → AUDIT-06 (follows DS-07)
- Status: done
- Commit: `AUDIT-06: audit entries know their record; the Person record gains its History`

## Owner decision (with this card)

History is visible to **anyone who can read the record**. It uses a new, narrow capability,
`employee.history`, held by every staff role. It is a curated timeline (what happened, who,
when) and **never carries the before/after values**. It is recorded as a **catalog addition,
not a matrix change**, the `staff-user.directory` pattern (UX-10b). The full audit log stays
Administrator + Auditor.

## What changed

### Database — `20261004090000_audit_resource_id`

- `aud_entries.resource_id` was added as a nullable UUID, with an index on
  `(resource, resource_id)`.
- The table stays append-only.
- **No backfill.** Older entries have no record id, and none is guessed from snapshots.
- `prisma migrate diff`: empty.

### API

| File | Change |
|---|---|
| `audit/domain/audit-entry.ts`, `audit/application/audit.service.ts` | `resourceId` on the record input, written in the same raw INSERT (no RETURNING, so both DB roles still work) |
| `employees/…/employees.service.ts` | create → the new row's id; every update (core / salary / govdata / terminate / GRO-03's `gro-completion`) → the employee id |
| `self-service/…/employee-accounts.service.ts` | invite and every status change → **the EMPLOYEE's id**, since an account change is about the person |
| `documents/…/documents.service.ts` | all 5 writes (create, confirm, quarantine, legal hold, delete) → the document id |
| `gro/…/gro-processes.service.ts` | create, update, status → the process id |
| `audit/…/audit-query.service.ts` | `forRecords([{resource, ids}], limit)`: entries about a set of records, newest first, **selecting no snapshot columns**. `AuditQueryService` is now exported |
| `documents/…/documents.service.ts` | `allForEmployee(id)`: every document ever attached, **deleted ones included**, as id/title/category |
| `auth/…/users.service.ts` | `displayNames(ids)` → id → display name, for any principal; nothing else |
| `modules/history/` (new) | A **delivery leaf**: imports Audit, Auth, Employees, Documents and GRO; owns no tables; imported only by `AppModule`. `GET /employees/:id/history` gathers the person's own id, their documents' and their processes' ids, asks Audit for those entries, and names the actors. Staff only (`scopeOf`), gated by `employee.history`. Unknown or malformed id → 404. 100 entries + `truncated` |
| `auth/domain/permissions.ts` | `employee.history` in the catalog and in `STAFF_BASE` |
| `test/role-matrix.e2e-spec.ts` | new row "Employee history (curated, no values)" for the four staff roles |
| `test/isolation/endpoint-registry.ts` | `GET /employees/:id/history` → `staff` |
| `@hr/contracts` `employee-history.ts` (new) | entries carry **exactly** id, at, resource, action, actor {name, role}, subject (a document's title + category, or a process's type) |

### Web

| File | Change |
|---|---|
| `employees/[id]/history-tab.tsx` (new) | The design system's Timeline: a 12px dot in an 18px halo, a 1px rail, a 16/22 medium title, the time in 14/20 muted, the actor "Name · Role" beneath. Tones follow the prototype: beginnings `primary`, completions `success`, endings `error`, routine edits `muted`. Each title is a translated action label plus the subject (document title or procedure type), with a fallback for an unknown action. A footer gives the start date of history and says when the list is truncated |
| `employees/[id]/page.tsx` | History is live; only Family, Leave and Mobilisation remain "coming soon" |
| `messages/{en,ar}.json` | `person.history.*` (labels for 17 resource/action pairs) |

## Tests — `test/employee-history.e2e-spec.ts`, 5/5

The fixture: a fresh company with self-service on, two employees at **the same company**, and
the same writes on both (core update, govdata update, a document, a GRO process + a status
change), plus an account invite for one.

1. **Every listed write records its id.** `aud_entries` holds `employee:create`,
   `employee:update`, `employee:govdata-update`, `employee-user:invite`, `document:create`,
   `gro-process:create` and `gro-process:status`, keyed to the subject's id or their
   document's/process's id.
2. **This person's history, none of a colleague's.** The history holds exactly those seven
   kinds. The colleague's document and process ids never appear, and the colleague's own
   history is one entry shorter (no invite).
3. **Newest first; names its subjects; no snapshots.** Every entry's keys are exactly
   `[action, actor, at, id, resource, subject]`. The body contains no `before`, `after`,
   `requestId`, `clientId`, or the govdata value written (`2027-01-01`). The process names its
   type and the document its category. The actor role is `hr_officer`.
4. GRO officer, Auditor and Administrator all read it.
5. Client rep → 403; employee principal → 403; unknown id → 404; malformed id → 404;
   unauthenticated → 401.

**Proven red:** with the query ignoring record ids (`resourceId: { not: null }`), tests 2 and 3
fail. Restored, and the run is green.

**Full API suite: 489/489 on all three runs** (484 + 5).

Registries: the isolation suite stays green with the new route; `modules.e2e-spec` (module
registration) is green; API typecheck and lint are clean.

## Live (dev servers restarted)

| Check | Result |
|---|---|
| hr_officer, Ahmed Hassan → History | After a department change and its reversal through the API: "**Profile updated** · 4 Oct 2026 · 03:32 AM · **Omar Al-Shehri · HR officer**", ×2. Title 16px/22px/500; dot 12px `rgb(163,163,163)` (muted, a routine edit); card padding 20. Footer: "History is kept from 4 Oct 2026; earlier changes were logged without the record they concerned." |
| **Pre-AUDIT-06 entries** | Absent. Ahmed's earlier DS-06/DS-07 edits carry no record id, as designed |
| `/ar/…` at 1280 and 375 | «حُدّث الملف | 4 أكتوبر 2026 · 03:32 ص | Omar Al-Shehri · أخصائي موارد بشرية», the footer in Arabic, **0px overflow** at both widths |
| gro_officer → `/employees/:id/history` | 200 |
| client_manager-a → same | **403** |

Web `typecheck` and `lint` clean. **`next build` succeeds**; `/[locale]/employees/[id]` is
21 kB. Contracts tests 3/3.

## Notes

- **Name-based dedupe is not attempted.** Two changes that cancel out (department set and set
  back) show as two entries, because that is what happened.
- **Actor names come from `auth_users.display_name`** for any principal. Helper or deleted
  accounts render as their role alone, or "Unknown user".
- `auth-account.activate` (an employee setting their password) is an **auth** write and is not
  in this card's list, so it isn't on the person's timeline yet. It is a one-line follow-up
  if wanted.
