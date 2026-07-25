# GRO-05 — `DocumentExpiring → GRO` auto-spawn (5th ADR-004 flow) — Evidence

- Date: 2026-07-25
- Task card: `BACKLOG.md` → GRO-05 (ACTION-PLAN 4.2 follow-on)
- Status: done
- Commit: `GRO-05: DocumentExpiring → GRO auto-spawn — an expiring document opens a renewal process`

## What shipped

The deferred **5th ADR-004 flow**: when a document nears expiry, GRO auto-opens a
renewal process for its employee — so the expiry becomes tracked government work,
not just a notification. GRO is a second, decoupled consumer of the document-expiry
engine's existing event (Notifications is the first).

- **Event gained `employeeId`** — `DocumentExpiringEvent` now carries the subject
  employee (`null` when the document isn't linked to one); the scan populates it from
  `doc.employeeId`. Additive; the 4 constructor call-sites updated (Notifications is
  unaffected — it reads other fields).
- **GRO subscribes** (`gro/application/document-expiring.handler.ts`,
  `@OnEvent(document.expiring)`): maps the document **category → GRO type**
  (`iqama → iqama_renewal`, `visa → work_permit_renewal`; others skip) and, when the
  event has an `employeeId` and no process already exists for the document, creates a
  `not_started` process with `dueDate = expiryDate` and `sourceDocumentId = documentId`.
- **Idempotency (the whole point).** The event fires **once per (document, tier)** —
  up to six times per document (60/30/14/7/1/0 d). A new `sourceDocumentId` column on
  `gro_processes` + `GroProcessesService.existsForDocument` guarantee **at most one
  process per document**. Without it, one document would spawn six duplicates.

## Why an event here (vs. GRO-03's direct call)

This is the clean one-way case: document-expiry doesn't import GRO; GRO imports only
the event **type** (the bus is `@Global`), so **no cycle** — exactly the CandidateHired
pattern. GRO-03 used a direct call only because GRO already imported Employees for
validation. Boundary lint green; the app boots.

## DoD check

| DoD item | Result |
|---|---|
| Expiring **iqama** doc (with employeeId) → one `iqama_renewal` process (`dueDate = expiryDate`, `sourceDocumentId` set) | ✅ test 1 |
| A second/third tier for the same document → **no duplicate** (idempotent) | ✅ test 2 |
| **visa** → `work_permit_renewal` | ✅ test 3 |
| Non-mapping category (`contract`) → spawns nothing | ✅ test 4 |
| Event with no `employeeId` → spawns nothing | ✅ test 5 |
| No DI cycle (GRO imports only the event type); boundary lint green | ✅ lint green; suite boots AppModule |
| No leakage: expiry-scan tests' docs have no employeeId → handler skips them | ✅ 0 spawned rows remain after the full suite |
| Suite + lint + typecheck (6 pkgs) + build green | ✅ suite **301/301** |

## Test output (`test/gro-document-expiring.e2e-spec.ts`, 5/5)

```
✓ spawns an iqama_renewal process for an expiring iqama document
✓ is idempotent — a second tier for the same document spawns no duplicate
✓ spawns work_permit_renewal for a visa document
✓ spawns nothing for a non-mapping category
✓ spawns nothing when the document has no employee
```

Full suite **58 files / 301 passed** (was 296 + 5 new). The auto-spawned process's
audit row is a SYSTEM action (actor_id null — the handler runs outside a request
context, like the scheduled scan; actor_id is nullable).

## Files

- `apps/api/src/modules/document-expiry/domain/document-expiring.event.ts` (+ employeeId)
- `apps/api/src/modules/document-expiry/application/expiry-scan.service.ts` (pass doc.employeeId)
- `apps/api/prisma/schema.prisma` + migration `20260725083806_gro_source_document` (sourceDocumentId + index)
- `apps/api/src/modules/gro/domain/{gro-process.ts, gro-effects.ts}` (+ sourceDocumentId, spawnTypeFor)
- `apps/api/src/modules/gro/application/gro-processes.service.ts` (+ existsForDocument, thread sourceDocumentId)
- `apps/api/src/modules/gro/application/document-expiring.handler.ts` (NEW) + `gro.module.ts` (register)
- `apps/api/test/gro-document-expiring.e2e-spec.ts` (NEW) · `document-expiring-event.e2e-spec.ts` (constructor call-sites)

## ADR-004 flows now live (5)

document-expiry → notify · request-status → notify-creator · request-created → spawn-task ·
candidate-hired → create-employee · **document-expiring → spawn-GRO-process**.
