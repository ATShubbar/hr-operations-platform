# NOTIF-02 — Notifications module + in-app notifications — Evidence

- Date: 2026-07-22
- Task card: `BACKLOG.md` → NOTIF-02 (ACTION-PLAN 3.3)
- Status: done
- Commit: `NOTIF-02: notifications module + in-app notifications (notify + read/mark-read)`

## What shipped

The Notifications module — the in-app substrate other modules raise notifications
through, and the first thing that delivers a notification end-to-end.

- **`notif_notifications`** — recipient-OWNED (keyed by `recipient_user_id`), so
  like `auth_users` / `cfg_user_settings` it is a system table with **NO RLS**:
  isolation is application-enforced (every query filters by the caller's context
  `actorId`, never input). Title/body stored **bilingual** (ar/en); `data` carries
  a structured link (e.g. `{ documentId }`); `readAt` (null = unread). Indexed on
  `(recipient_user_id, read_at)` and `created_at`.
- **`NotificationsService`** — the producer entry point:
  - `notify({ recipientUserId, category, title, body, data? })` — writes the
    in-app record (the source of truth) **and enqueues a dispatch job** on the
    NOTIF-01 queue for async delivery (email lands in NOTIF-03). Exported so
    producers (the document-expiry engine, 3.4) call it.
  - `listForActor` / `unreadCount` / `markRead` / `markAllRead` — all keyed by a
    userId the controller takes from the session.
- **Read/mark-read API** (`self` scope, `notification.read`, held by **every**
  authenticated principal):
  - `GET /notifications[?unread=true]` → `{ notifications, unreadCount }`
  - `POST /notifications/:id/read` — mark one read (own only)
  - `POST /notifications/read-all` — mark all read → `{ updated }`
  - actor comes from the session, never the URL → a user cannot address another
    user's notifications (`markRead` of someone else's → 404, no existence leak).

## DoD check

| DoD item | Result |
|---|---|
| notify() delivers in-app + enqueues dispatch | ✅ record created; job enqueued (NOTIF-03 sends) |
| Recipient reads own; others cannot see it | ✅ alice sees it, bob's list excludes it (unreadCount 0) |
| Unread count + unread filter | ✅ count tracks reads; `?unread=true` returns only unread |
| Mark one / mark all read | ✅ readAt set; read-all → `{updated:2}`, unread→0 |
| Cross-user mark → 404 (app-enforced) | ✅ bob marking alice's → 404; still unread for alice |
| Unauthenticated → 401 | ✅ |
| Coverage gates green | ✅ catalog (`notification.read`), isolation (+3 `self` routes), write-audit (2 mark-read routes EXEMPT — self-service read-state, no business mutation) |
| `lint typecheck test build` green | ✅ API build clean; **suite 176/176** (+5), exit 0 (no unhandled rejections) |

## Test output (`test/notifications.e2e-spec.ts`, 5/5)

```
✓ notify() delivers in-app to the recipient; another user never sees it
✓ mark one read; the unread filter and count reflect it
✓ mark all read clears the unread count
✓ cannot mark another user's notification read → 404
✓ unauthenticated → 401
```

Full suite **176/176** (33 files), exit 0. Live: `GET /notifications` →
`{"notifications":[],"unreadCount":0}` for a fresh user; unauth → 401.

## Design decisions recorded

- **Recipient-owned, app-enforced (no RLS)** — a notification belongs to a user,
  not a client; it follows the `auth_users` / `cfg_user_settings` pattern (filter
  by the context actor, never input). The `self` scope class covers the endpoints.
- **In-app is the source of truth; email is best-effort** — `notify()` commits the
  in-app row, then enqueues the dispatch job. If delivery later fails, the user
  still has the in-app notification. (A transactional outbox is the ADR-004 path,
  NOTIF-05.)
- **Bilingual stored content** — title/body as ar/en pairs (the codebase's
  bilingual-field convention), so the reader gets their language; NOTIF-03's
  templates become the producer-side helper that fills these in.
- **Mark-read is audit-EXEMPT** — a self-service read-state toggle, not a
  business-data mutation (recorded as such in the write-audit registry).

## Deferred (to later NOTIF cards)

- **NOTIF-03** — email channel: pluggable transport (dev capture / SMTP deferred)
  + ar/en templates + the dispatch worker's real send (renders from the
  notification and emails the recipient).
- **NOTIF-04** — per-user notification preferences (`notification-pref.update`)
  gating email dispatch (in-app is always on).
- **NOTIF-05** — domain-event bus (ADR-004) so producers emit events and
  Notifications subscribes (vs. calling `notify()` directly).
- **NOTIF-06** — web UI (notification bell + list + preferences).
