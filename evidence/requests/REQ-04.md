# REQ-04 — Requests web UI (staff console) — Evidence

- Date: 2026-07-24
- Task card: `BACKLOG.md` → REQ-04 (ACTION-PLAN 4.3)
- Status: done — **completes the Requests sub-module (4.3)**
- Commit: `REQ-04: Requests web UI (staff console — list/create/process)`

## What shipped

A staff console for requests over the REQ-02/03 API. Web-only; no API change.

- **`(app)/requests/page.tsx`** — a filtered list (client + status), a **create**
  dialog, and a **process** dialog:
  - **List** — title, client (resolved name), type, status badge, priority,
    dual-calendar due date; client + status filters.
  - **Create** (`request.create`) — client / type / title / description /
    priority / due date → `POST /requests`. Hidden without the capability.
  - **Process** (`request.process`) — advances the status; the dialog offers only
    **legal next steps** (the workflow mirrored client-side, the API validates
    authoritatively) → `POST /requests/:id/process`. Hidden without the
    capability, and per-row hidden once a request is terminal (closed/cancelled).
- **Nav** — a "Requests" item gated on `request.read`.
- **i18n** — a `requests` message namespace (ar/en): types, statuses, priorities,
  filters, dialog copy.

## Design decisions recorded

- **Staff console; client view deferred to Portal 5.1.** The API scopes client
  reps to their own client, so the page also works read-own for a rep, but it's
  built for staff (client column/filter/selector).
- **Legal transitions only in the process dialog** — a client-side mirror of the
  REQ-03 workflow (`open → in_progress|cancelled`, …); the server remains the
  source of truth (400 on an illegal jump).
- **Reused primitives** — badge/button/dialog/select/table + `dualDate`; no new
  UI components.

## DoD check

| DoD item | Result |
|---|---|
| List with client/status filters; status badges; dual-calendar due | ✅ browser (3 seed requests, resolved client names) |
| Create (`request.create`) → new request appears | ✅ browser ("REQ-04 UI smoke test" added) |
| Process (`request.process`) advances status; legal next steps only | ✅ browser (Open → In progress) |
| Nav gated on `request.read`; capability-gated New/Process buttons | ✅ browser (company_admin sees both) |
| Both languages / RTL | ✅ browser (en + ar; RTL, Arabic headers/labels/client names) |
| Web typecheck + lint green; no prod next build while dev server runs | ✅ both clean |

## In-browser verification (dev web proxy → API :3001; real PG/Redis)

Signed in as an enrolled `company_admin` (has `request.create` + `request.process`).

- **List** — the three seed requests rendered with resolved client names ("Alpha
  Trading Co.", "Beta Contracting Est."), types, status badges (gold "In
  progress"), priorities, and dual-calendar due dates ("Safar 22, 1448 AH · August
  5, 2026").
- **Process** — opened the dialog on an open request ("Current status: Open"),
  advanced it; the row flipped to **In progress** and the dialog closed.
- **Create** — "New request" → filled title (client pre-selected) → the new row
  appeared at the top.
- **ar/en + RTL** — `<html dir="rtl">`; nav "الطلبات"; Arabic column headers
  (العنوان/العميل/النوع/الحالة/الأولوية/الاستحقاق/إجراءات); Arabic client name
  ("شركة الألف التجارية"), type ("عام"), status ("مفتوح"). No console errors.

Dev data (the smoke-test request + the modified seed statuses + the verification
MFA enrollment) was cleaned up / re-seeded afterward.

## Requests sub-module (4.3) — COMPLETE

REQ-01 (table + service) · REQ-02 (dual-path API) · REQ-03 (processing + notify)
· **REQ-04 (web UI)**.

## Deferred

- Assignee **picker** (needs a staff-user list endpoint) — process currently
  advances status only; the API accepts an assignee.
- The client-facing requests view (Client Portal, 5.1).
- `request.delete` (archive); an SLA-breach alert engine.
