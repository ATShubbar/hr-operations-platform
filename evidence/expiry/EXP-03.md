# EXP-03 — Document-expiry dashboard (web) — Evidence

- Date: 2026-07-23
- Task card: `BACKLOG.md` → EXP-03 (ACTION-PLAN 3.4)
- Status: done
- Commit: `EXP-03: document-expiry dashboard (web) + admin run-scan trigger`

## What shipped

A staff-facing **Document Expiry** dashboard — the human-facing companion to the
EXP-02 daily scan. Web-only; no API change (reuses the `document.read` and
`expiry.run` endpoints).

- **Dashboard** (`(app)/expiry/page.tsx`) — one `GET /documents?expiringBefore=
  <today+60d>` call, grouped client-side into four urgency buckets: **Expired ·
  Next 7 days · Next 30 days · Next 60 days**, each with a count card and a table
  (title, category, client, dual-calendar expiry, days-left/overdue label).
  Client + category filters; empty state when nothing is due.
- **Admin "Run scan now"** — gated by `useCan('expiry.run')`; triggers
  `POST /expiry/scan`, renders the returned `{scanned, alertsRaised,
  notificationsSent}` summary, then refreshes. Non-admins don't see the button.
- **Nav + i18n** — an "Expiry" sidebar item gated on `document.read`; ar/en
  strings for both locales; dual-calendar dates via `lib/employee-format`
  `dualDate` (Hijri · Gregorian).

## Design decisions recorded

- **Dedicated route over a documents-page toggle** — expiry monitoring is a
  distinct concern; a bucketed view doesn't fit the flat documents list.
- **Buckets client-side from one request** — `expiringBefore=today+60d` returns
  everything within the horizon (and already-expired, since the filter is `lte`),
  deleted excluded by the API default; the page computes `daysUntil` and buckets.
  No new backend.
- **Manual trigger not flag-gated** — matches EXP-02: an explicit admin action
  overrides the on/off feature flag (the flag governs only the daily automatic
  run).

## DoD check

| DoD item | Result |
|---|---|
| Lists docs expiring ≤60d, grouped into 4 buckets with counts | ✅ browser (1/1/1/1) |
| Dual-calendar expiry dates; client/category filters; empty state | ✅ browser (Hijri·Gregorian; filters render) |
| Admin sees "Run scan now" → triggers + shows summary + refreshes | ✅ browser (company_admin: summary notice rendered) |
| Non-admin doesn't see the button | ✅ browser (hr_officer: button absent) |
| Nav gated on `document.read`; page guards on 401 | ✅ nav shows for staff; 401 → /login |
| Verified in-browser: both languages/RTL, bucketed view, admin round-trip | ✅ see below |
| Web `typecheck` + `lint` green; no prod `next build` while dev server runs | ✅ both clean |

## In-browser verification (dev servers: web proxy → API :3001, MinIO/PG/Redis up)

Seeded four near-expiry demo documents on client "Alpha Trading Co." (expired /
+5d / +20d / +48d) to populate the buckets (seed docs are all >60d out).

- **Read view (hr_officer, no MFA):** dashboard rendered the four buckets with
  correct counts and rows — iqama **4d overdue** (Expired), visa **5d left**
  (Next 7 days), passport **20d left** (Next 30 days), contract **48d left**
  (Next 60 days); dual-calendar expiry (e.g. `Safar 5, 1448 AH · July 19, 2026`).
  **No "Run scan now" button** (hr_officer lacks `expiry.run`).
- **RTL / Arabic:** `<html dir="rtl">`; nav `الانتهاءات`, title `انتهاء صلاحية
  المستندات`, buckets `منتهية / خلال 7 أيام / خلال 30 يوماً / خلال 60 يوماً`,
  Arabic dual-calendar `5 صفر 1448 هـ · 19 يوليو 2026`, `متأخر 4 يوم`.
- **Endpoint enforcement through the proxy:** `POST /api/expiry/scan` as
  hr_officer → **403 Forbidden**.
- **Admin round-trip (company_admin, MFA-enrolled):** `POST /expiry/scan` →
  **200** `{scanned:4, alertsRaised:4, notificationsSent:11}`. Reloaded → the gold
  **"Run scan now"** button now shows; clicking it rendered the in-UI notice
  **"Scan complete — 4 scanned, 0 alerts raised, 0 notifications sent"** — 0 on
  the repeat because the first scan already claimed all tiers (**idempotency
  visible in the UI**).
- No browser console errors.

Demo documents + their alerts/notifications were cleaned up after; the seed
admin's MFA (enrolled only for this verification) was reset.

## Deferred

- Per-client flag honoring / client-configurable thresholds (CONF substrate).
- A drill-through from a dashboard row to the document, and inline actions
  (renew/replace) — fold into a later Documents/GRO card.
