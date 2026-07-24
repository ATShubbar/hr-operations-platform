# TASK-04 — Tasks web UI (staff console) — Evidence

- Date: 2026-07-24
- Task card: `BACKLOG.md` → TASK-04 (ACTION-PLAN 4.4)
- Status: done — **completes the Tasks sub-module (4.4) and the Requests+Tasks epic**
- Commit: `TASK-04: Tasks web UI (staff console — list/create/edit/assign)`

## What shipped

A staff console for tasks over the TASK-02 API. Web-only; no API change.

- **`(app)/tasks/page.tsx`** — a filtered list (status + client), a **create**
  dialog, an **edit** dialog (status + priority), and an **Assign to me** quick
  action:
  - **List** — title (+ a **"(From request)"** tag for TASK-03-spawned tasks),
    client (resolved, or "—"), status badge, priority, assignee ("Assigned" when
    it's you, short id otherwise, "Unassigned" when null), dual-calendar due.
  - **Create** (`task.create`) — title / client (optional) / priority /
    description / due → `POST /tasks`.
  - **Edit** (`task.update`) — status + priority → `PATCH /tasks/:id`.
  - **Assign to me** (`task.update`) — sets `assigneeUserId` to the session user
    (`useSession().userId`); hidden once it's yours.
- **Nav** — a "Tasks" item gated on `task.read`.
- **i18n** — a `tasks` message namespace (ar/en).

## Design decisions recorded

- **Assign-to-me, not a full user picker** — there is no staff-user list endpoint
  yet, so assignment is limited to self for now (the API accepts any assignee).
- **Own/assigned scope is the API's job** — the page shows whatever the API
  returns (non-admins see their own/assigned; `task.read-all` holders see all).
- **Reused primitives** — badge/button/dialog/select/table + `dualDate`.

## DoD check

| DoD item | Result |
|---|---|
| List with status/client filters; status badges; assignee; dual-calendar due; from-request tag | ✅ browser (2 seed tasks, one "(From request)") |
| Create (`task.create`) → new task appears | ✅ browser ("TASK-04 UI smoke test") |
| Edit (`task.update`) changes status | ✅ browser (Open → In progress) |
| Assign to me (`task.update`) | ✅ browser (assignee → "Assigned", button hidden) |
| Nav gated `task.read`; buttons capability-gated | ✅ browser (company_admin) |
| Both languages / RTL | ✅ browser (en + ar; RTL, Arabic headers/labels) |
| Web typecheck + lint green; no prod next build while dev server runs | ✅ both clean |

## In-browser verification (dev web proxy → API :3001; real PG/Redis)

Signed in as an enrolled `company_admin` (`task.read-all` + create/update).

- **List** — the two seed tasks rendered, incl. the **"(From request)"** tag on
  the task the seed links to the iqama-renewal request; resolved client name,
  status badges, assignee short id, due.
- **Assign to me** — the GOSI task's assignee flipped to **"Assigned"** and the
  button disappeared.
- **Edit** — changed its status **Open → In progress**.
- **Create** — "New task" → the row appeared.
- **ar/en + RTL** — `<html dir="rtl">`; nav "المهام"; Arabic headers
  (العنوان/العميل/الحالة/الأولوية/المكلَّف/الاستحقاق/إجراءات); "غير مُسنَدة",
  "إسناد إليّ". No console errors.

Dev data (the smoke task + the modified seed task + the verification MFA
enrollment) was cleaned up / re-seeded afterward.

## Tasks sub-module (4.4) — COMPLETE

TASK-01 (table + service) · TASK-02 (HTTP + own/assigned) · TASK-03 (Requests →
Tasks via event) · **TASK-04 (web UI)**.

**Requests + Tasks epic (4.3 + 4.4) COMPLETE.**

## Deferred

- Assignee **picker** (needs a staff-user list endpoint).
- A "my tasks" quick filter; task detail view.
