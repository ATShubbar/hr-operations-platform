# NOTIF-03 — Email channel (pluggable transport + ar/en templates) — Evidence

- Date: 2026-07-23
- Task card: `BACKLOG.md` → NOTIF-03 (ACTION-PLAN 3.3)
- Status: done
- Commit: `NOTIF-03: email channel (pluggable transport, ar/en templates, dispatch worker send)`

## What shipped

The email delivery channel — the dispatch worker now renders and sends, replacing
the NOTIF-01 echo.

- **Pluggable email transport** (`domain/email.ts`) — an `EmailTransport`
  interface + `EMAIL_TRANSPORT` DI token (same seam as the DOC-04 scanner).
- **Dev capture transport** (`infra/capture-email-transport.ts`) — records every
  sent message in memory (and logs it), so delivery is inspectable in dev/CI
  without SMTP. Production binds a real transport (nodemailer over the KSA SMTP
  relay) to the token — **deferred to infra**, no other change.
- **ar/en email templates** (`application/notification-templates.ts`) — render a
  notification into `{ subject, text }` in the recipient's language, wrapping the
  (already-bilingual, NOTIF-02) title/body with ar/en email framing.
- **Dispatch service** (`application/notification-dispatch.service.ts`) — per job:
  load the notification (own table) → resolve the recipient's **email** (auth's
  `UsersService.findById`) and **language** (new `ConfigService.resolveLanguageForUser`
  — the user's `ui.language` override else the system default) → render → send.
- **Dispatch worker** (`api/notification-dispatch.processor.ts`) — the sole
  `dispatch`-queue processor now; handles `notification` jobs, acks others.
- **Consolidation** — the NOTIF-01 echo processor + its worker module were
  removed; the notification worker (in `NotificationsWorkerModule`) is the single
  dispatch consumer. `MainModule` loads it; ordinary specs still don't (the
  BullMQ blocking connection stays out of their teardown — suite still exits 0).

## DoD check

| DoD item | Result |
|---|---|
| Pluggable transport (token + interface) | ✅ `EMAIL_TRANSPORT`; capture bound via `useClass` |
| ar/en templates, recipient-language selection | ✅ default → Arabic email; `ui.language=en` → English email |
| Worker renders + sends | ✅ dispatch → transport records `{to, subject, text}` |
| Recipient email + language resolved from the right modules | ✅ `UsersService.findById` (auth), `ConfigService.resolveLanguageForUser` (config) |
| Missing notification → no-op | ✅ no throw, no email |
| Single dispatch consumer (echo removed) | ✅ NOTIF-01 echo deleted; queue.e2e updated (acks non-notification jobs) |
| `lint typecheck test build` green | ✅ API build clean; **suite 179/179** (+3), exit 0 |

## Test output (`test/notification-email.e2e-spec.ts`, 3/3)

```
✓ renders + sends in the recipient default language (Arabic)
✓ renders + sends in the recipient's chosen language (English via ui.language)
✓ a missing notification is a no-op (no throw, no email)
```

The dispatch service is driven directly (deterministic) so the test doesn't race
the running dev worker on the shared `dispatch` queue; the queue→worker roundtrip
is proven by `queue.e2e`. Full suite **179/179** (34 files), exit 0; live API
boots via `MainModule` (health 200).

## Design decisions recorded

- **Pluggable transport, dev capture** — mirrors the DOC-04 scanner: the interface
  is the seam, the dev impl is real+inspectable (records messages), the production
  impl (SMTP) binds to the token later.
- **Recipient language, not caller language** — the worker sends to a recipient
  who is not the caller, so `ConfigService.resolveLanguageForUser(userId)` resolves
  language out of request context (per-user override → system default).
- **Cross-module reads via services** — the recipient email comes from auth's
  `UsersService`, language from `ConfigService`; the worker only reads its OWN
  `notif_notifications` table directly (no cross-module DB access).
- **One dispatch consumer** — the NOTIF-01 echo was a placeholder; two processors
  on one queue would race, so it was removed and the notification worker is the
  sole consumer.
- **Tested via the service, not the queue** — avoids the shared-Redis-queue race
  with the running dev worker; the queue path is covered separately.

## Deferred (to later NOTIF cards)

- **Real SMTP transport** (nodemailer + KSA relay) → infra; binds to
  `EMAIL_TRANSPORT`.
- **NOTIF-04** — per-user notification preferences (`notification-pref.update`)
  gating whether email is sent per category (in-app always on).
- **NOTIF-05** — domain-event bus (ADR-004) so producers emit events.
- **NOTIF-06** — web UI (notification bell + list + preferences).
- Richer templates (HTML, per-category structured layouts) beyond the ar/en text
  framing.
