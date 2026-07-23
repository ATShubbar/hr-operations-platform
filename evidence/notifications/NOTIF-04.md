# NOTIF-04 — Per-user notification preferences — Evidence

- Date: 2026-07-23
- Task card: `BACKLOG.md` → NOTIF-04 (ACTION-PLAN 3.3)
- Status: done
- Commit: `NOTIF-04: per-user notification email preferences (per-category, gates dispatch)`

## What shipped

Each user can turn **email** off per notification category. The in-app
notification is always written (source of truth); the preference gates only the
email side of dispatch.

- **`notif_preferences`** (NOTIF-04 migration) — user-OWNED `(user_id, category,
  email_enabled)`, PK `(user_id, category)`, **no RLS**, `app_staff` grant only
  (the `cfg_user_settings` / `notif_notifications` pattern). Absence of a row =
  email enabled (**opt-out** model).
- **`NotificationPreferencesService`** — `effectiveFor(userId)` (default-on map
  overlaid with overrides), `isEmailEnabled(userId, category)` (the dispatch
  gate), `setEmailEnabled(...)` (upsert, **audited** `notification-pref.update`,
  actor-attributed).
- **API** (on the notifications controller) — `GET /notifications/preferences`
  (`notification.read`) → effective per-category email flags; `PATCH
  /notifications/preferences/:category` (`notification-pref.update`,
  `{emailEnabled}`) → own preferences only (actor from the session, never the
  URL), returns the full effective map. Unknown category → 404, bad payload → 400.
- **Dispatch gate** — `NotificationDispatchService.dispatch()` now checks
  `isEmailEnabled(recipient, category)` and **skips the email** when disabled; the
  in-app record is untouched. `NotificationsWorkerModule` imports
  `NotificationsModule` to reach the service (no cross-module DB access).
- **Permission** `notification-pref.update` → all roles (STAFF_BASE + ALL_CLIENT).

## Design decisions recorded

- **Notifications owns the preference data (dedicated table), not the CONF
  substrate** — a per-category email toggle is notifications-domain data, and the
  named permission is `notification-pref.update`; both point to notifications
  owning it (ADR-003). It follows the same user-owned pattern as
  `cfg_user_settings` (the CONF-03 dependency), not literal reuse of that table.
- **Opt-out default** — absence = enabled, so we never silently drop mail; a user
  explicitly turns a category off. All five categories are toggleable in v1
  (a "mandatory categories" carve-out for e.g. `system` is deferred).
- **Gate in the worker, not in `notify()`** — `notify()` still writes the in-app
  row + enqueues unconditionally; only the email send is suppressed. "In-app
  always on" holds.
- **Audited** — a preference change is a business-meaningful user-settings write
  (mirrors CONF-03 `config.user-set`), not read-state like mark-read (exempt).

## DoD check

| DoD item | Result |
|---|---|
| GET returns effective per-category email flags (defaults + overrides) | ✅ test 1/2 |
| PATCH upserts one category, own-only, unknown→404 / bad→400 | ✅ test 2/3 |
| Dispatch: email skipped when disabled, sent when enabled; in-app written either way | ✅ test 4 |
| Preferences per-user (no leak across users) | ✅ test 5 |
| Unauthenticated → 401 | ✅ test 6 |
| Isolation `self` + write-audit coverage green | ✅ both routes `self`; PATCH `notification-pref.update` audited |
| Suite + lint + typecheck + build green | ✅ **192/192** (+6), exit 0; lint/typecheck/build clean |

## Test output (`test/notification-preferences.e2e-spec.ts`, 6/6)

```
✓ defaults to email enabled for every category
✓ PATCH toggles one category and persists; others stay enabled
✓ rejects an unknown category (404) and a bad payload (400)
✓ dispatch suppresses email for a disabled category but sends for an enabled one
✓ preferences are per-user — one user’s change does not leak to another
✓ rejects unauthenticated callers (401)
```

HTTP surface exercised over supertest; the dispatch gate is proven by driving the
dispatch SERVICE directly (deterministic — no shared-queue race with a running
dev worker; the queue path is covered by `queue.e2e`). Full suite **192/192**
(37 files), exit 0.

## Deferred (to later NOTIF cards)

- **NOTIF-05** — domain-event bus (ADR-004) so producers emit events instead of
  calling `notify()` directly.
- **NOTIF-06** — web UI: notification bell/list + a preferences panel over this
  GET/PATCH surface.
- Mandatory (non-optional) categories; digest/frequency preferences beyond the
  per-category on/off.
