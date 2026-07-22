# DOC-03 — Documents read / download / delete — Evidence

- Date: 2026-07-22
- Task card: `BACKLOG.md` → DOC-03 (ACTION-PLAN 3.2)
- Status: done
- Commit: `DOC-03: documents read/download/delete (presigned GET, expiry filter, soft-delete)`

## What shipped — the read side

- **`GET /documents`** (`document.read`) — filtered list: `clientId`,
  `employeeId`, `category`, `status`, and **`expiringBefore`** (the expiry view —
  documents due on/before a date, ordered soonest-first). Deleted documents are
  excluded by default.
- **`GET /documents/:id`** (`document.read`) — one document's metadata; unknown → 404.
- **`GET /documents/:id/download`** (`document.read`) — a short-lived **presigned
  GET URL** for the blob. Only an `available` document is downloadable; pending
  (no blob yet) / deleted / quarantined → **409**.
- **`DELETE /documents/:id`** (`document.delete`) — **removes the blob** from the
  store (idempotent) then **soft-deletes** the record (status → `deleted`,
  category-scoped like upload). The metadata row survives for audit/retention;
  the PII blob is gone. Audited (`document.delete`).
- **Permissions** — `document.read` to **all staff** (matrix: everyone reads);
  `document.delete` to the CRUD roles (company_admin, hr_officer, recruiter,
  gro_officer), category-scoped via the same `canWriteCategory` as upload.

## DoD check

| DoD item | Result |
|---|---|
| List filters (client / category / expiry) | ✅ `?category=iqama`, `?expiringBefore=…` narrow correctly; deleted excluded |
| Get by id | ✅ 200; unknown → 404; finance (read) can get |
| Presigned download serves the bytes | ✅ available → `{url}`, GET url → 200 + exact bytes |
| Non-available not downloadable | ✅ pending → 409 |
| Delete removes blob + soft-deletes | ✅ status `deleted`; download → 409; excluded from list |
| Delete category-scoped + gated | ✅ recruiter deleting `iqama` → 403; finance (no delete) → 403 |
| Delete audited | ✅ `document.delete` |
| Read is broad; unauth rejected | ✅ finance reads; no session → 401 |
| Coverage gates green | ✅ catalog (`document.read`/`delete`), isolation (+4 `staff` routes), write-audit (+`document.delete`) |
| `lint typecheck test build` green | ✅ API build clean; **suite 165/165** (+5) |

## Test output (`test/documents-read.e2e-spec.ts`, 5/5)

```
✓ list filters by client, category, and expiry
✓ get by id (finance has document.read); unknown → 404
✓ download: available → presigned GET serves the bytes; pending → 409
✓ delete removes the blob + soft-deletes; category-scoped; audited
✓ unauthenticated list → 401
```

Full suite **165/165** (30 files).

## Live check (running API + MinIO, seed data)

```
GET /documents                        → 3 seed docs (iqama/contract/iqama, statuses + expiries)
GET /documents?expiringBefore=2026-12-01 → only the 2026-11-01 iqama (expiry view works)
GET /documents/<id>/download as finance  → 200 (presigned URL; read is broad)
```

## Design decisions recorded

- **Presigned GET, like the upload** — download returns a short-lived signed URL;
  the blob streams from the store to the client, never through the API.
- **Only `available` is downloadable** — pending has no blob, deleted/quarantined
  have none to serve → 409, not a broken/empty download.
- **Delete = blob gone, record kept** — remove the object (PII), soft-delete the
  row (status `deleted`) so the audit/retention trail and expiry history survive.
  PDPL-aware: the erasable content is erased, the ledger persists.
- **Delete is category-scoped** — a recruiter can't delete an iqama, matching the
  upload scope (the matrix's category-restricted CRUD).

## Deferred (to later DOC cards)

- **DOC-04** — virus-scan hook (pluggable; dev pass-through; ClamAV deferred),
  running between upload and `available`; retention/legal-hold policy on delete
  (PDPL, 0.9).
- **DOC-05** — documents web UI (list + expiry view + upload + download).
- Client-rep read/download-own → Client Portal (5.1); employee-link validation.
