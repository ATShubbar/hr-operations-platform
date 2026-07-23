# EXP-02 — Daily schedule + manual trigger — Evidence

- Date: 2026-07-23
- Task card: `BACKLOG.md` → EXP-02 (ACTION-PLAN 3.4)
- Status: done
- Commit: `EXP-02: daily expiry-scan schedule (BullMQ repeatable, flag-gated) + manual trigger`

## What shipped

The EXP-01 scan now runs on a **daily schedule** and can be triggered on demand.

- **Daily repeatable job** (`expiry` queue, EXP-02) — `ExpirySchedulerService`
  upserts a BullMQ job scheduler on application bootstrap: cron `0 6 * * *`
  pinned to `Asia/Riyadh`. Upserted by a fixed id so restarts never duplicate it.
- **Flag-gated worker** (`ExpiryScanProcessor`, `@Processor('expiry')`) — each
  occurrence checks `ConfigService.isEnabled('flag.document-expiry-alerts')`; off
  → no-op, on → `scan(new Date())`. The engine ships **dormant** (flag default
  `false`); an admin flips it on to activate scheduled scanning.
- **Producer/worker split** — the queue *registration* lives in the `@Global`
  `QueueModule` (producer, safe everywhere); the **worker + scheduler** live in
  `ExpiryWorkerModule`, loaded only by `MainModule` (+ the schedule e2e). The
  BullMQ blocking connection and the repeatable-job registration stay out of
  every ordinary spec's teardown — suite still exits 0.
- **Manual trigger** — `POST /expiry/scan` (`expiry.run`, admin staff only,
  `@HttpCode(200)`) runs the scan and returns `{scanned, alertsRaised,
  notificationsSent}`. **Not** flag-gated: an explicit admin/ops action overrides
  the on/off flag.

## Design decisions recorded

- **Flag gates the automatic path, not `scan()`** — `ExpiryScanService.scan()`
  stays a pure capability; the flag check sits in the processor. The manual
  endpoint calls `scan()` directly, so ops can force a run without touching the
  flag.
- **Cron 06:00 Asia/Riyadh** — before the KSA workday, tz-pinned so it's correct
  regardless of server timezone.
- **Trigger is `AUDIT_EXEMPT`** — the scan is system-wide (cross-client), so
  there's no single `clientId` for the AUDIT-03 client-scoped tx; its durable
  record is the `exp_alerts` + notifications it raises. Registered `staff` in the
  isolation harness (cross-client admin action, returns only a summary).
- **Per-client flag honoring deferred** — the system flag gates the whole engine;
  a client opting out (the flag's client level) is a later refinement.

## DoD check

| DoD item | Result |
|---|---|
| Daily repeatable job registered (cron + tz), present under the worker module | ✅ test 1 (`0 6 * * *`, `Asia/Riyadh`) |
| Automatic run flag-gated: off → 0, on → runs | ✅ test 4 (off → 0 alerts, on → 1) |
| Manual `POST /expiry/scan`: admin → 200 + summary, alerts raised | ✅ test 2 |
| Non-admin → 403; unauthenticated → 401 | ✅ test 3 |
| Worker isolated to MainModule (split); suite exits 0, no unhandled rejections | ✅ full suite **186/186**, exit 0 |
| Isolation + write-audit registries updated (coverage green) | ✅ `POST /expiry/scan` staff + AUDIT_EXEMPT |
| `lint typecheck test build` green | ✅ all clean |

## Test output (`test/expiry-schedule.e2e-spec.ts`, 4/4)

```
✓ registers the daily repeatable scan on bootstrap
✓ POST /expiry/scan runs the scan for an admin and returns a summary
✓ POST /expiry/scan is admin-only (403) and rejects unauthenticated (401)
✓ the scheduled processor is flag-gated: off → no-op, on → runs
```

The flag-gate is proven by driving the processor directly (no shared-queue race
with a running dev worker — the NOTIF-03 precedent); the queue→worker path is
covered by `queue.e2e`. The flag doc is created *after* the global manual-trigger
scans so the flag-off no-op is observable. Full suite **186/186** (36 files),
exit 0.

## Deferred (to later cards)

- **EXP-03 (optional)** — web surfacing beyond the documents `expiringBefore`
  filter (an expiry dashboard / an admin "run scan now" button).
- Per-client flag honoring; client-configurable thresholds (CONF substrate);
  emitting a domain event once the ADR-004 bus lands (NOTIF-05).
