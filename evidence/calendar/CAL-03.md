# CAL-03 — Calendar web UI (agenda view + create/edit) — Evidence

- Date: 2026-07-24
- Task card: `BACKLOG.md` → CAL-03 (ACTION-PLAN 5.2)
- Status: done
- Commit: `CAL-03: calendar web UI — agenda over /calendar/view + create/edit events`

## What shipped

The staff calendar console over `/calendar/view` (CAL-02), closing the epic.
Front-end only — no API/contract change.

- **Agenda** (`(app)/calendar/page.tsx`, nav-gated `calendar.read`) — items grouped
  by day with **dual-calendar Hijri·Gregorian day headers**; each item a row with a
  **kind badge** (Event / Task / Request / GRO), title, and time (events) or "Due ·
  <status>" (deadlines). Prev/next **month navigation**.
- **Create** (`calendar.create`) — a New-event dialog (title, start/end
  datetime-local, location) → `POST /calendar/events`.
- **Edit own events** (`calendar.update`) — clicking an Event item fetches it
  (`GET /calendar/events/:id`) and opens a pre-filled dialog → `PATCH`; deadlines are
  read-only (not clickable).
- **Delete** (`calendar.delete`, Company-Admin-only) — a Delete button in the edit
  dialog, shown only when the actor holds `calendar.delete`.
- **Shell** — a "Calendar" nav link gated on `calendar.read` (all staff); `nav.calendar`
  + a `calendar.*` block (kind labels, fields) in en + ar.

## Bug fixed during verification

The month window was built from local-midnight dates (`new Date(y, m, 1)`), which —
under a positive UTC offset — shifted the ISO boundary a day and **mislabelled the
month** (showed "July 31" while displaying August). Fixed to UTC-anchored bounds
(`Date.UTC(y, m, 1)`), matching the UTC item dates. Verified the label then read
"August 1, 2026".

## Browser verification (live, dev servers on API :3001 / web :50554)

Logged in as the seeded GRO officer (`staff-gro_officer@seed.hr.local`).

| DoD item | Result |
|---|---|
| Calendar nav visible (all staff have calendar.read) | ✅ nav = …/GRO/**Calendar**/Settings |
| Agenda merges own events + Task/Request/GRO deadlines with dual-calendar headers | ✅ Aug 2026: own "Muqeem visit" event (11:30) + Request ("Salary certificate", Due·open) + GRO ("sponsorship_transfer", Due·submitted), each kind-badged |
| Month navigation | ✅ prev/next shift the month; label dual-calendar |
| **Create through the UI** | ✅ created "Client review — Alpha Trading" (Aug 18, 13:00–14:00) → appeared in the agenda; confirmed in `cal_events` |
| Both locales | ✅ en (LTR) + ar (RTL — sidebar right, Hijri·Gregorian headers, kind labels طلب/حدث/معاملة) |
| No console errors | ✅ `preview_console_logs` error level: none |

The verification-created event + its audit row were removed afterward.

## Static checks

```
pnpm --filter @hr/web typecheck   # tsc --noEmit — clean
pnpm --filter @hr/web lint         # eslint src — clean (logical-only utilities, RTL)
messages/en.json + ar.json          # both parse; no missing-key warnings
```

## Files

- `apps/web/src/app/[locale]/(app)/calendar/page.tsx` (NEW)
- `apps/web/src/components/app-shell.tsx` (Calendar nav link, `calendar.read`-gated)
- `apps/web/messages/{en,ar}.json` (`nav.calendar` + `calendar.*`)

## Epic status

**Calendar epic (5.2) COMPLETE** — CAL-01 (events table+service), CAL-02 (API +
aggregated view), CAL-03 (web UI). Fifteen product screens now. Google Calendar
outbound sync (5.3, with the PII whitelist) remains a separate epic.
