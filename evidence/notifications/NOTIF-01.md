# NOTIF-01 — BullMQ dispatch infra — Evidence

- Date: 2026-07-22
- Task card: `BACKLOG.md` → NOTIF-01 (ACTION-PLAN 3.3)
- Status: done
- Commit: `NOTIF-01: BullMQ dispatch infra (producer/worker split, roundtrip proven)`

## What shipped

The async-dispatch backbone the Notifications module (NOTIF-02+) enqueues onto —
BullMQ over the existing Redis, wired into Nest via `@nestjs/bullmq`.

- **`QueueModule`** (`@Global`) — `BullModule.forRoot` with the connection from
  `REDIS_URL` (`maxRetriesPerRequest: null` — the BullMQ worker requirement) +
  `registerQueue({ name: 'dispatch' })`. This is the **producer** side; it holds
  no blocking connection.
- **`DispatchWorkerModule`** — the **consumer** (`DispatchProcessor`, a
  `WorkerHost` on the `dispatch` queue). For now it just acknowledges the job
  (echoes the payload) — the roundtrip proof; NOTIF-03 renders + sends email here.
- **Producer / worker split** — `AppModule` includes only `QueueModule` (safe in
  every spec). The worker runs only via **`MainModule`** (the real process) and
  the queue e2e. This keeps BullMQ's blocking worker connection out of every
  other test's setup/teardown (which otherwise emits benign "Connection is
  closed" noise on shutdown).
- **Graceful shutdown** — `app.enableShutdownHooks()` in `main.ts`, so SIGTERM/
  SIGINT fire `onApplicationShutdown` and `@nestjs/bullmq` closes the worker
  cleanly instead of killing it mid-job.

## DoD check

| DoD item | Result |
|---|---|
| Job enqueued → processed by the worker | ✅ roundtrip against Redis :6380; worker echoes the payload back as the job return value |
| Connection is env-driven | ✅ from `REDIS_URL`; `maxRetriesPerRequest: null` |
| Workers close cleanly on shutdown | ✅ `app.close()` returns promptly; suite exits 0 with **no unhandled rejections** |
| No blocking-connection noise across the suite | ✅ producer/worker split — worker only in `MainModule` + queue e2e |
| No HTTP endpoints (pure infra) | ✅ nothing to register in the isolation/audit harnesses |
| `lint typecheck test build` green | ✅ API build clean; **suite 171/171** (+2); test exit 0 |

## Test output (`test/queue.e2e-spec.ts`, 2/2)

```
✓ a job enqueued on the dispatch queue is processed by the worker
✓ processes several jobs
```

The worker ran with our payload — job return value `{ handled: true, echo: { hello: 'notif-01' } }`.
Full suite **171/171** (32 files), exit 0. Live API boots via `MainModule`
(app + worker), `GET /health` → 200.

## Design decisions recorded

- **`@nestjs/bullmq`** (idiomatic Nest DI: `BullModule`, `@Processor`,
  lifecycle-managed workers) rather than hand-rolling BullMQ.
- **Producer / worker split** — the single most important structural choice here.
  A BullMQ Worker holds a blocking `BRPOPLPUSH` connection; tearing it down at the
  end of every app-creating spec surfaces a benign "Connection is closed"
  rejection that fails the run. Keeping the worker out of `AppModule` (only in
  `MainModule` + the queue e2e) removes the noise AND mirrors good practice
  (workers often run in their own process).
- **`dispatch` queue as the seam** — one shared outbound queue; Notifications
  enqueues typed jobs onto it and the processor branches (NOTIF-03).

## Deferred (to the Notifications cards)

- **NOTIF-02** — `notif_notifications` table (in-app, per-user) +
  `NotificationsService.notify()` (writes in-app record + enqueues) + read/
  mark-read API.
- **NOTIF-03** — email transport (pluggable; dev capture / SMTP deferred) + ar/en
  templates + the dispatch worker's real send logic.
- **NOTIF-04** — per-user notification preferences (`notification-pref.update`).
- **NOTIF-05** — domain-event bus (ADR-004) + Notifications subscribes.
- **NOTIF-06** — web UI (notification bell + preferences).
