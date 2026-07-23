# EXP-01 — Document-expiry scan engine + idempotent alert ledger — Evidence

- Date: 2026-07-23
- Task card: `BACKLOG.md` → EXP-01 (ACTION-PLAN 3.4)
- Status: done
- Commit: `EXP-01: document-expiry scan engine + idempotent alert ledger`

## What shipped

The core of the document-expiry engine (3.4) — the first real cross-module
consumer. A scan reads documents, resolves recipients, and raises notifications,
raising each (document, threshold) tier **at most once, ever**, so a *daily*
scan is safe. The daily schedule + trigger endpoint are EXP-02.

- **Idempotency ledger** (`exp_alerts`, EXP-01 migration) — client-scoped table
  (ADR-001 standard RLS/grants; staff full access, client-rep SELECT-own for a
  future portal), unique `(document_id, threshold)`. That unique index is the
  claim that guarantees at-most-once per tier.
- **Threshold tiers** (`domain/thresholds.ts`) — `[0, 1, 7, 14, 30, 60]` days.
  `tierFor(daysUntil)` returns the smallest tier a document has reached; a doc
  escalates 60 → 30 → 14 → 7 → 1 → 0 as its expiry nears, each firing once. Date
  math is UTC-calendar (tz/DST-stable; `expiry_date` is a DATE column).
- **Recipient resolution** (`domain/recipients.ts`) — category → consultancy
  staff roles, mirroring the DOC-02 write scope: gov docs → HR/admin/GRO, CVs →
  HR/admin/recruiter, others → HR/admin. `UsersService.findStaffByRoles()` (new,
  auth) returns the *active staff* holding those roles.
- **Bilingual content** (`domain/messages.ts`) — ar/en title/body per tier
  ("expiring soon" vs. "has expired"), stored bilingual (NOTIF-02) so each
  recipient reads their language and the email channel (NOTIF-03) renders the
  same.
- **Scan service** (`application/expiry-scan.service.ts`) — claim the ledger
  slot first (P2002 → skip), then `NotificationsService.notify()` per recipient
  with a `{ documentId, category, threshold, expiryDate }` data link.

## Design decisions recorded

- **ADR-004 fallback** — the architecture bills 3.4 as the "first event
  consumer," but the event bus is NOT built (NOTIF-05, todo). The documented
  fallback applies — *"else producers call `notify()`"* — so the engine calls
  `NotificationsService.notify()` directly. Swapping to an emitted event when
  NOTIF-05 lands is contained to the scan service. No architecture conflict.
- **Claim-then-notify (at-most-once per tier)** — the ledger row is written
  before notifying; a crash in between drops that one alert rather than
  duplicating it on every daily run. The unique index, not a read-modify-write,
  is the guard (safe under concurrent scans).
- **Ledger keyed by (document, tier), not recipient** — a staff member added
  after a tier fired won't be back-alerted for it. Acceptable v1; there is no
  per-client staff-assignment model yet (coarse role fan-out).
- **No routes in EXP-01** — the scan is a service; the isolation harness is
  endpoint-based, so nothing to register until EXP-02's trigger endpoint. RLS
  still ships on `exp_alerts` per the checklist.

## DoD check

| DoD item | Result |
|---|---|
| One alert per (doc, tier) to each resolved staff recipient; ledger row written | ✅ test 1 |
| Idempotent: second scan same day → 0 new | ✅ test 2 (ledger + notif counts unchanged) |
| Escalation: crossing the next tier → exactly one new alert, prior tier kept | ✅ test 3 (`[7, 30]`) |
| Expired (≤ asOf) fires tier 0 ("expired" copy); deleted never alert | ✅ test 1 (`docContract` tier 0; `docDeleted` none) |
| Beyond widest window → no alert | ✅ test 1 (`docFar` none) |
| Recipient resolution matches category→role | ✅ test 1 (iqama → hr+gro not recruiter; cv → hr+recruiter not gro) |
| RLS/grants ship on `exp_alerts` (checklist) | ✅ migration (staff full / client read, NULLIF) |
| `lint typecheck test build` green | ✅ typecheck/lint/build clean; **suite 182/182** (+3), exit 0 |

## Test output (`test/expiry-scan.e2e-spec.ts`, 3/3)

```
✓ raises one alert per (document, crossed tier) with correct recipients
✓ is idempotent — a second scan on the same day raises nothing new
✓ escalates — a later scan crossing the next tier raises exactly one new alert
```

Driven via `ExpiryScanService.scan()` directly (deterministic). Documents/alerts
are keyed to a synthetic client id so ledger assertions are exact regardless of
other DB rows; per-recipient attribution is by `data.documentId` against
freshly-created staff. Full suite **182/182** (35 files), exit 0.

## Deferred (to later EXP cards)

- **EXP-02** — daily BullMQ repeatable job → scan (worker in `MainModule` only,
  producer/worker split) + feature-flag gate (`flag.document-expiry-alerts`,
  already in the CONF catalog) + a manual `POST /expiry/scan` trigger for ops/CI.
- **EXP-03 (optional)** — web surfacing beyond the existing documents
  `expiringBefore` filter.
- Client-configurable thresholds (on the CONF substrate); per-client staff
  assignment to narrow the fan-out; emitting a domain event once NOTIF-05 lands.
