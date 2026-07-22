# DOC-02 — Documents upload flow (presigned issue + confirm) — Evidence

- Date: 2026-07-22
- Task card: `BACKLOG.md` → DOC-02 (ACTION-PLAN 3.2)
- Status: done
- Commit: `DOC-02: documents upload flow (presigned issue + confirm, category-scoped)`

## What shipped — the module's first HTTP surface

The presigned, two-step, direct-to-store upload flow — the blob never passes
through the API.

- **`POST /documents`** (`document.upload`, 201) — validates the payload +
  client, checks category scope, creates a **pending** metadata row (service-
  derived per-client storage key, DOC-01), and returns
  `{ document, upload: { url (presigned PUT), method, headers: {Content-Type}, expiresInSeconds } }`.
  The client transfers bytes **directly to object storage**.
- **`POST /documents/:id/confirm`** (`document.upload`, 200) — HEADs the object
  (`StorageService.statObject`); if the blob isn't there → **400** (a caller
  can't confirm an upload that never happened); otherwise marks the document
  **available** and records its **real size** from the object.
- **Category-scoped authorization** (`domain/document-policy.ts`) — beyond the
  `document.upload` gate, an in-handler check per the permission matrix:
  **recruiter → recruitment (`cv`)**, **GRO → government (`iqama`/`passport`/
  `visa`/`gosi`/`national_id`)**, **admin/HR → all**. (The EMP-02 pattern: a
  coarse permission plus a finer capability check.)
- **`document.upload`** granted to company_admin, hr_officer, recruiter,
  gro_officer (the matrix's CRUD roles). Both routes are audited
  (`document.create` on issue, `document.confirm` on confirm) and registered in
  the isolation (`staff`) + write-audit harnesses.

## DoD check

| DoD item | Result |
|---|---|
| Presigned issue → PUT → confirm round-trip | ✅ issue `pending` + PUT URL → PUT 200 → confirm `available`, `sizeBytes` = real length |
| Blob verified before confirm | ✅ confirm without upload → **400** |
| Category scope enforced | ✅ recruiter `cv` 201 / `iqama` 403; GRO `iqama` 201 / `cv` 403; HR all |
| document.upload gate | ✅ finance (no upload perm) → 403 |
| Client validated | ✅ unknown client → 400 |
| Payload validated; unauth rejected | ✅ `{}` → 400; no session → 401 |
| Audited (issue + confirm) | ✅ `document.create` + `document.confirm` |
| Coverage gates green | ✅ catalog (`document.upload`), isolation (+2 `staff` routes), write-audit (+2) |
| `lint typecheck test build` green | ✅ API build clean; **suite 160/160** (+7) |

## Test output (`test/documents-api.e2e-spec.ts`, 7/7)

```
✓ issue → presigned PUT → confirm marks available with real size
✓ confirm before the blob is uploaded → 400
✓ category scope — recruiter: recruitment yes, government no
✓ category scope — GRO: government yes, recruitment no
✓ a role without document.upload → 403
✓ unknown client → 400; invalid payload → 400; unauthenticated → 401
✓ the flow is audited (document.create + document.confirm)
```

Full suite **160/160** (29 files).

## Live check (running API + MinIO)

```
1) issue   → status=pending, method=PUT
2) PUT bytes → 200
3) confirm → status=available, sizeBytes=17   (real byte count)
```

## Design decisions recorded

- **Presigned, direct-to-store** — the API signs a PUT URL; the client uploads
  the bytes itself, so the API stays stateless for large blobs (the STOR-01
  contract, now exercised over HTTP).
- **Confirm verifies the blob** — `statObject` HEAD before flipping to
  `available`, and the size comes from the object, not the client's claim.
- **Category scope, not just a permission** — the matrix distinguishes
  recruitment vs government docs; `canWriteCategory` enforces that a coarse
  `document.upload` doesn't let a recruiter file an iqama.
- **Staff path, explicit clientId** — like EMP-02's create; client-rep upload-own
  is deferred to the portal (the table already ships RLS for it).

## Deferred (to later DOC cards)

- **DOC-03** — download (presigned GET) + delete (`document.delete` + object
  removal) + list/filter (incl. by expiry), `document.read`.
- **DOC-04** — virus-scan hook (pluggable; dev pass-through; ClamAV deferred) +
  retention/PDPL; the scan runs between upload and `available`.
- **DOC-05** — documents web UI. Client-rep upload-own → Client Portal (5.1).
- Employee-link validation (that `employeeId` belongs to the same client) — a
  small integrity check, deferred.
