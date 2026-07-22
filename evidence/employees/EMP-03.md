# EMP-03 — Employees web UI (list + detail/edit) — Evidence

- Date: 2026-07-22
- Task card: `BACKLOG.md` → EMP-03 (ACTION-PLAN 3.1)
- Status: done
- Commit: `EMP-03: employees web UI (list + detail, field-redaction reflected)`

## What shipped

The staff employees console over the EMP-02 API. The defining property: **the
UI does not decide redaction — the API does.** `salary`/`govdata` come back
`null` when the caller lacks `salary.read` / `govdata.read`, so the detail page
renders a 🔒 "restricted" notice for a redacted group rather than empty fields.
`useCan` only hides the *edit* affordances; the server remains the real gate.

- **List** (`(app)/employees/page.tsx`) — core columns only (name, nationality,
  job title, status badge, Hijri hire date); rows link to detail; a core-only
  "New employee" dialog gated on `employee.create` (client select + core fields;
  salary/govdata are set on the detail page via their own per-group endpoints).
- **Detail** (`(app)/employees/[id]/page.tsx`) — three section cards:
  - **Core** — always shown; Edit gated on `employee.update` → `PATCH /employees/:id`.
  - **Salary & payroll** — shown only when `salary !== null`; Edit gated on
    `salary.update` → `PATCH /employees/:id/salary`.
  - **Government data** — shown only when `govdata !== null`; Edit gated on
    `govdata.update` → `PATCH /employees/:id/govdata`.
  - **Terminate** — gated on `employee.delete` → `DELETE /employees/:id` (soft).
- **Dual-calendar dates** (`lib/employee-format.ts`) — every date renders
  `Hijri · Gregorian` via `@hr/dates` (ADR-005: storage Gregorian UTC, render
  Hijri). Date inputs are Gregorian (`<input type="date">`); storage/display
  stay dual-calendar.
- **i18n** — full `employees` namespace + `nav.employees` in `en`/`ar`; nav item
  gated on `employee.read`. RTL via logical Tailwind utilities only.

## DoD check — verified in-browser (real sessions, through the Next proxy)

Same employee (Ahmed Hassan, `e0000001-…-002`) viewed as three roles:

| Role | Salary card | Govdata card | Core edit | Terminate | Matches matrix |
|---|---|---|---|---|---|
| finance | **visible + Edit** | 🔒 restricted | — | — | R salary, no govdata, no employee.update/delete ✅ |
| gro_officer | 🔒 restricted | **visible + Edit** | Edit | — | govdata CRUD, no salary, employee RU (no delete) ✅ |
| hr_officer | visible + Edit | visible + Edit | Edit | **Terminate** | full: salary RU, govdata R…, employee CRUD ✅ |

- **Redaction reflected** ✅ — finance sees salary (7,000 SAR, WPS Compliant) and
  a locked govdata card; GRO sees the exact inverse (iqama 2456789812 + a locked
  salary card). Neither card's data is present in the DOM when redacted — it is
  `null` from the API.
- **Edit affordances gated** ✅ — finance has no Core edit; GRO has Core + Govdata
  edit; only `employee.delete` holders (hr_officer) see Terminate.
- **Per-group write path** ✅ — as finance, the dialog's exact calls:
  `PATCH /employees/:id/salary {housingAllowance:1750}` → **200** (housing now
  1750); `PATCH /employees/:id/govdata` → **403**; `PATCH /employees/:id` → **403**.
- **Dual-calendar** ✅ — "Iqama expiry — Shawwal 7, 1448 AH · March 15, 2027".
- **ar/en + RTL** ✅ — Arabic detail renders RTL: title/labels right-aligned,
  card Edit button on the start side, Arabic enum labels (ذكر / نشط), gold theme
  badge intact.
- **`typecheck` + `lint` green** ✅ (`@hr/web`: `tsc --noEmit` clean, `eslint src`
  clean).

## Screens verified

- `/en/employees` — list, 3 seed employees, no "New" button as finance (no
  `employee.create`).
- `/en/employees/:id` as finance — salary visible+editable, govdata 🔒, no core
  edit, no terminate.
- `/en/employees/:id` as gro_officer — inverse redaction; dual-calendar govdata
  dates.
- `/ar/employees/:id` as gro_officer — RTL + Arabic labels + gold theme.
- `/en/employees/:id` as hr_officer — Terminate + all cards editable.

## Design decisions recorded

- **Redaction = the API's job, reflected 1:1 in the UI.** A redacted group is a
  `null` in the response → a 🔒 notice on screen. The client never holds data it
  isn't allowed to see (defence in depth beyond hiding buttons).
- **Create is core-only.** Salary/govdata are set through the detail page's
  per-group edit, mirroring the API's per-group permission model and keeping the
  create form manageable.
- **Dual-calendar display, Gregorian input.** Honours ADR-005 without a Hijri
  date-picker dependency; the value stored/shown is always dual-calendar.

## Not run / deferred

- Prod `next build` **intentionally not run** — a dev/preview server was live and
  `next build` clobbers `.next` (documented landmine, AUTH-08). Build-readiness is
  covered by `tsc --noEmit` (the same type gate) + `eslint`.
- **Client-rep read-own employees** + the `govdata:status` tier → Client Portal
  (ACTION-PLAN 5.1), like `client.read`.
- TanStack Query (standing UI fast-follow); create-form salary/govdata inline.
