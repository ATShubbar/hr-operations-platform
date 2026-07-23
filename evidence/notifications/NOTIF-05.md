# NOTIF-05 — Domain-event bus (ADR-004 acceptance) — Evidence

- Date: 2026-07-23
- Task card: `BACKLOG.md` → NOTIF-05 (ACTION-PLAN 3.3)
- Status: done
- Commit: `NOTIF-05: in-process domain-event bus (ADR-004 accepted); expiry publishes, Notifications subscribes`

## What shipped

The ADR-004 in-process domain-event bus, proven by inverting the first
producer→consumer dependency: the document-expiry scan now **publishes** a fact
and Notifications **subscribes** — the producer no longer imports Notifications.

- **`modules/events`** (shared, `@Global`) — `EventBus.publish(event)` over
  `@nestjs/event-emitter`. Dispatch is **in-process, awaited** (`emitAsync`, so a
  producer that awaits keeps its ordering) and **error-isolated** (a throwing
  consumer is logged, never surfaced to the producer). `DomainEvent` base shape
  carries a `correlationId` for trace continuity across the async hop.
- **`DocumentExpiringEvent`** — a past/present-tense fact **owned by** the
  document-expiry module and exported from its `public-api`. Carries the fact +
  the resolved audience (`recipientUserIds`) + `correlationId`. NO notification
  content — that's the consumer's concern.
- **Producer** (`ExpiryScanService`) — per newly-claimed `(document, tier)`,
  resolves recipients (it owns the category→staff-role policy) and **publishes**
  the event instead of calling `notify()`. `document-expiry.module` **drops its
  `NotificationsModule` import** (now depends only on Auth + Documents + the
  `@Global` events bus).
- **Consumer** (`DocumentExpiringHandler`, `@OnEvent(DocumentExpiringEvent.NAME)`
  in Notifications) — owns "how people are told": renders the bilingual content
  (`expiry-content.ts`, **moved here** from document-expiry) and raises one
  notification per recipient (each still enqueues its own email dispatch,
  gated by NOTIF-04 preferences).
- **ADR-004 → Accepted** (file header + `adr/README.md` index), with the scope
  note that the transactional-outbox half is deferred to the first must-not-lose
  consumer.

## Design decisions recorded

- **Producer owns the fact + audience; consumer owns content + delivery.** The
  category→role rule is document-domain (stays with the producer); rendering +
  channel is Notifications' (`expiry-content.ts` moved there). This is the ADR
  ownership line ("Notifications owns how people are told").
- **Awaited best-effort, not the outbox.** ADR-004 classes notifications as
  best-effort → fire-and-forget/in-process; awaiting handlers keeps the scan's
  claim-ledger→publish at-most-once and keeps tests deterministic. The
  transactional outbox lands with the first crash-critical consumer, not here.
- **Consumer imports the event from the producer** (ADR: events owned + exported
  by the publisher). The edge is one-directional and a **type/constant import
  only** — no Nest-module cycle; document-expiry never imports Notifications.
- **`notificationsSent` unchanged** — the producer resolved the audience, so the
  EXP-02 scan summary + web dashboard are untouched (no ripple).

## DoD check

| DoD item | Result |
|---|---|
| Event bus: in-process, awaited, error-isolated; event owned + exported by producer | ✅ `modules/events`, `DocumentExpiringEvent` in document-expiry public-api |
| Scan publishes; document-expiry no longer imports NotificationsModule | ✅ module import dropped; module-boundary lint + build green |
| Notifications `@OnEvent` handler creates the notifications (content owned here) | ✅ `document-expiring-event.e2e` |
| End-to-end preserved (EXP-01/02/03 still green) | ✅ expiry specs 7/7 |
| ADR-004 flipped to Accepted (file + index) | ✅ |
| Suite + lint + typecheck + build green | ✅ clean run **195/195** exit 0; lint/typecheck/build clean |

## Test output

New `test/document-expiring-event.e2e-spec.ts` (3/3) — publish via the bus →
consumer notifies:

```
✓ fans out a notification to each recipient with rendered content
✓ renders the expired variant for tier 0
✓ an event with no recipients is a no-op
```

NOTIF-05-touched specs together (7 files, **26/26**, zero errors, two runs):
`document-expiring-event, expiry-scan, expiry-schedule, notification-email,
notification-preferences, notifications, queue`. Full suite: a clean run is
**38 files / 195 passed, exit 0**.

### Note on suite flakiness (pre-existing, not NOTIF-05)

The full suite intermittently emits a benign BullMQ `"Connection is closed"`
unhandled rejection at app teardown (the documented NOTIF-01 landmine) and,
rarely, a flaky spec failure from parallel e2e specs sharing one Postgres/Redis.
This is **pre-existing and independent of NOTIF-05**: it reproduces with the new
event spec excluded, the NOTIF-05-touched specs pass reliably in isolation, and a
clean full run (195/195, exit 0) is reproducible. A stale orphaned dev API worker
(`nest start --watch`, ~1 day old) that was draining the shared Redis queue was
stopped (with the owner's approval) to reduce the contention.

## Deferred

- **NOTIF-06** — web UI: notification bell/list + preferences panel.
- **Transactional outbox** (ADR-004) — lands with the first must-not-lose
  consumer (e.g. hire → employee, Recruitment 4.1), not with best-effort
  notifications.
- Per-handler (rather than per-publish) error isolation + a dead-letter path, if
  a future consumer needs it.
