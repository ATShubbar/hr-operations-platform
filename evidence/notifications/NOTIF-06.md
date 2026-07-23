# NOTIF-06 — Notification bell + preferences UI — Evidence

- Date: 2026-07-23
- Task card: `BACKLOG.md` → NOTIF-06 (ACTION-PLAN 3.3)
- Status: done — **closes the Notifications epic (3.3)**
- Commit: `NOTIF-06: notification bell + preferences UI (closes Notifications epic 3.3)`

## What shipped

Notifications are now visible in-product. Web-only; no API change (over the
NOTIF-02 read API + the NOTIF-04 preferences API).

- **Notification bell** (`components/notification-bell.tsx`) in the app-shell
  header — an unread-count badge (gold, `99+` cap) + a hand-rolled RTL-safe
  popover (`end-0`, click-outside) listing recent notifications in the reader's
  language with a localized relative timestamp (`Intl.RelativeTimeFormat`) and an
  unread dot. Click a row → mark read; **Mark all read** clears them. Light
  polling of the unread count (60s), list fetched on open. `GET /notifications`,
  `POST /:id/read`, `POST /read-all`.
- **Preferences section** (`components/notification-preferences.tsx`) on the
  settings page — the five categories with per-category **email** on/off toggles
  (badge + Enable/Disable, reusing the flags pattern — no Base UI switch), and an
  "in-app is always on" note. `GET /notifications/preferences`, `PATCH
  /notifications/preferences/:category`.
- **i18n** — a `notifications` message namespace (ar/en): bell labels, category
  labels, relative-time "just now", preferences copy.

## Design decisions recorded

- **Hand-rolled popover + toggle** — the UI kit has no popover/switch; built from
  existing primitives with logical RTL positioning (`end-0`) and click-outside,
  rather than pulling in Base UI components.
- **Light polling, no websockets** — proportionate for an internal ops tool.
- **Preferences folded into settings** — next to "My preferences"; every
  principal already holds `notification.read` + `notification-pref.update`.
- **Bell for every authenticated principal** — rendered in the shell (behind the
  session guard); client-reps see their own too (they hold `notification.read`).

## DoD check

| DoD item | Result |
|---|---|
| Bell shows unread count; opens list in reader's language + relative time + unread state | ✅ browser (99+ badge; 50 items; "10 minutes ago") |
| Click a notification marks it read; count updates | ✅ browser (dots 50→49) |
| Mark-all-read clears them | ✅ browser (badge gone, 0 dots, button hidden) |
| Preferences: 5 categories email on/off; toggle persists; in-app-always-on noted | ✅ browser + API (`document_expiry:false` after toggle) |
| Both languages / RTL | ✅ browser (en + ar; Arabic relative time "قبل 11 دقيقة"; bell popover on the left in RTL) |
| Web typecheck + lint green; no prod next build while dev server runs | ✅ both clean |

## In-browser verification (dev web proxy → API :3001; real PG/Redis)

Signed in as `staff-hr_officer` (which had a backlog of real expiry-engine
notifications from the EXP/NOTIF-05 flow — the end-to-end producer→event→consumer
path, now visible).

- **Bell** — header badge showed `99+`; opening the popover listed 50
  notifications (e.g. "Iqama expiring soon" · "10 minutes ago" · body). Clicking
  one cleared its unread dot (50→49); **Mark all read** removed the badge
  entirely and cleared all dots.
- **Preferences** — the settings "Notifications" section listed the five
  categories at "Email: On"; toggling **Document expiry → Disable** flipped the
  row to "Off" and `GET /notifications/preferences` returned
  `{document_expiry:false, task:true, request:true, general:true, system:true}`.
- **ar/en + RTL** — `<html dir="rtl">`; nav on the right, the bell popover on the
  left (`end-0`); Arabic content + Arabic relative time ("قبل 11 دقيقة"); the
  preferences section localized ("البريد الإلكتروني: متوقف/مفعّل", in-app-always-on
  note). No browser console errors.

Verification data (a toggled pref + the leftover test-scan notification backlog
for seed staff) was cleaned up afterward.

## Notifications epic (3.3) — COMPLETE

NOTIF-01 (BullMQ dispatch) · NOTIF-02 (in-app) · NOTIF-03 (email) · NOTIF-04
(per-user preferences) · NOTIF-05 (ADR-004 event bus) · **NOTIF-06 (web UI)**.

## Deferred

- Real-time push (websockets/SSE) instead of polling; pagination / "load more"
  beyond the most recent 50; a dedicated notifications page.
