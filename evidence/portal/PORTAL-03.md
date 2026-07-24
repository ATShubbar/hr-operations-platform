# PORTAL-03 — `GET /portal/documents` (own, download own available) — Evidence

- Date: 2026-07-24
- Task card: `BACKLOG.md` → PORTAL-03 (ACTION-PLAN 5.1)
- Status: done
- Commit: `PORTAL-03: portal documents — own client, available-only + presigned download`

## What shipped

Client reps can now list and **download their own** documents through the portal
— the third own-scoped portal read, and the first to hand back a **presigned
object-store URL**.

- **Shared mapper extracted** — `toDocumentResponse` moved out of the staff
  controller into `documents/domain/document-view.ts`, exported via
  `public-api.ts`; the staff `DocumentsController` imports it aliased as
  `toResponse` (call sites unchanged). Document metadata carries no field-level
  redaction, so this is a straight record→response move — the staff suites are
  the regression guard.
- **`GET /portal/documents`** (`portal.read` + flag-gated) — the caller's own
  client's **available** documents. Deliberately narrower than the staff list:
  never `pending` (in-flight uploads) or `quarantined` (infected), so a client
  can't see an in-flight upload or learn a file was quarantined.
- **`GET /portal/documents/:id`** — one own **available** document's metadata.
- **`GET /portal/documents/:id/download`** — a short-lived (300s) presigned GET
  URL for an own available document.
- Anything not own+available (another client's, pending/quarantined/deleted, or
  unknown id) is a uniform **404** — no existence or state leak. The single
  `ownAvailableDocument()` guard is shared by `:id` and download.
- `DocumentsModule` + `StorageModule` added to `PortalModule` (still a leaf → no
  cycle). The storage key is service-derived per-client, so the presigned URL
  itself cannot cross client boundaries.

## Available-only — the deliberate tightening

| Doc state | Staff list | Portal |
|---|---|---|
| `available` | ✅ | ✅ |
| `pending` (upload not confirmed) | ✅ | ❌ excluded / 404 |
| `quarantined` (failed virus scan) | ✅ | ❌ excluded / 404 |
| `deleted` (soft-deleted) | excluded by default | ❌ excluded / 404 |

## DoD check

| DoD item | Result |
|---|---|
| Rep lists ONLY own **available** docs; pending/quarantined excluded + 404 on `:id`/download | ✅ tests 2, 4, 8 |
| Cross-client `:id`/download → 404; unknown id → 404 | ✅ tests 5, 6, 8 |
| Download returns a presigned GET URL (own+available) with 300s TTL, per-client key | ✅ test 7 |
| Flag off → 403; staff (no portal.read) → 403; unauth → 401 | ✅ tests 1, 9, 10 |
| Staff documents behavior unchanged (refactor) | ✅ documents.e2e (5) + documents-api.e2e (7) + documents-read.e2e (5) green |
| Isolation (`client-read` ×3) + catalog coverage green | ✅ all three routes registered; isolation 10/10 |
| Suite + lint + typecheck + build green | ✅ suite **239/239**; lint + tsc + build clean |

## Test output (`test/portal-documents.e2e-spec.ts`, 10/10)

```
✓ is blocked (403) while flag.client-self-service is off
✓ lists ONLY the caller own client AVAILABLE documents
✓ GET :id returns an own available document metadata
✓ GET :id for a non-available own document is 404 (no state leak)
✓ GET :id for another client document is 404 (existence not leaked)
✓ GET :id for an unknown id is 404
✓ download returns a short-lived presigned GET URL for an own available document
✓ download for a non-available or cross-client document is 404
✓ is client-only — staff lack portal.read (403)
✓ rejects unauthenticated callers (401)
```

Full suite **47 files / 239 passed** (was 229 + 10 new). 6 of 7 full-suite runs
were 239/239 green; one showed a single non-deterministic failure. portal-documents
passes 10/10 deterministically in isolation and in every green run — the lone
intermittent failure is the documented shared-Redis / BullMQ teardown-timing
flake (this change touches only documents/portal, no Redis). The runner also
exits 1 on the benign ioredis "Connection is closed" teardown rejection (same
landmine). No orphaned dev worker present.

## Deferred (to later PORTAL cards)

- **PORTAL-04** — the client portal **UI** (flag-gated shell + company / employees
  / documents / requests pages).
