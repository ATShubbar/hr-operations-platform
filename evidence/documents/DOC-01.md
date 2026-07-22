# DOC-01 — Documents module + registry table — Evidence

- Date: 2026-07-22
- Task card: `BACKLOG.md` → DOC-01 (ACTION-PLAN 3.2)
- Status: done
- Commit: `DOC-01: documents module + doc_documents registry (expiry first-class)`

## What shipped

The Documents module's metadata layer — the registry the upload flow (DOC-02),
downloads (DOC-03), and the expiry engine (3.4) all build on.

- **`doc_documents`** — client-scoped table (standard `client_id` RLS, per the
  checklist): metadata only (the blob lives in object storage under `storageKey`,
  STOR-01). Columns: category (enum), title, fileName, contentType, sizeBytes,
  storageKey, status (enum), issueDate, **`expiryDate` (first-class + indexed)**,
  `employeeId` (nullable link, no cross-module FK), uploadedByUserId, timestamps.
  Grants: staff full; **client-rep SELECT-own** (create-own lands with its
  endpoint). RLS `client_read` with the load-bearing `NULLIF`.
- **`DocumentsService`** (staff path) — `create` (transactional + audited),
  `list`/`listByClient`/`getById`, and **`expiringOnOrBefore(date, clientId?)`**
  — the query the document-expiry engine will consume, cheap because `expiryDate`
  is first-class and indexed.
- **The service owns the object key** — `create` derives `storageKey` from
  `StorageService.keyFor(clientId, 'documents', <random id>, <sanitized name>)`,
  so keys are per-client-prefixed, unguessable, and collision-free; callers never
  choose where the blob lands.
- **Audit** — every create records `resource=document, action=create` scoped to
  the document's client; snapshot is **non-sensitive metadata** (category / title
  / status / expiry) — never the storage key or blob.
- **Seed** — 3 document fixtures linked to seed employees, each with a first-class
  `expiryDate` (iqama 2027-03-15, contract 2026-12-31, iqama 2026-11-01) so the
  expiry engine has data.
- No HTTP endpoints yet (mirrors EMP-01) → nothing to register in the isolation/
  audit harnesses; the API lands in DOC-02/03.

## DoD check

| DoD item | Result |
|---|---|
| Client-scoped table checklist | ✅ client_id + grants (staff full / rep SELECT) + RLS (both policies, NULLIF) + expiry/employee indexes |
| Staff create round-trips metadata + expiry | ✅ category, `expiryDate` (2027-03-15) and `employeeId` persist |
| Per-client, sanitized storage key | ✅ `clients/<clientId>/documents/<uuid>/file_name_1_.pdf` (spaces/parens sanitized) |
| `expiryDate` first-class + queryable | ✅ `expiringOnOrBefore` returns due docs, excludes null/later/deleted |
| Create audited, non-sensitive snapshot | ✅ `document.create` scoped to client; snapshot has `iqama`, no `storage` |
| Client-rep reads own only (RLS) | ✅ scoped read returns C1 only, never C2 |
| Client-rep cannot write (no grant) | ✅ INSERT/DELETE → permission denied |
| Seed idempotent | ✅ 3 documents; `db:seed` reports them; upsert by fixed id |
| `lint typecheck test build` green | ✅ API build clean; **suite 153/153** (+5) |

## Test output (`test/documents.e2e-spec.ts`, 5/5)

```
✓ staff create derives a per-client storage key, stores metadata + expiry, audits
✓ staff see across clients; listByClient is scoped
✓ expiringOnOrBefore finds first-class expiries, excludes null + later + deleted
✓ client-rep reads ONLY its own client’s documents (client_id-scoped RLS)
✓ client-rep cannot write documents (no grant)
```

`db:seed` → "2 client companies; 3 employees; **3 documents**; …". Full suite
**153/153** (28 files).

## Design decisions recorded

- **Metadata here, blob in storage** — `doc_documents` never holds bytes; the blob
  lives under `storageKey` (STOR-01 per-client prefix). The registry is the
  scannable, queryable, RLS-protected index over the blobs.
- **`expiryDate` is first-class + indexed** — the architecture calls out "expiry
  as first-class data"; `expiringOnOrBefore` proves the expiry engine's core query
  is a cheap indexed lookup, not a scan.
- **The service owns the key** — deriving `storageKey` from a per-client prefix +
  random id (not caller input) keeps keys isolated and unguessable.
- **Client-rep SELECT-own now, create-own later** — matches EMP-01's precedent;
  the matrix's client_admin "CR own" write path lands with its endpoint (portal /
  a later DOC card), deny-by-default until then.
- **`employeeId` link, no FK** — documents attach to an employee (iqama/passport/
  contract) via a nullable id, app-validated when set; no cross-module FK
  (consistent with the codebase).

## Deferred (to later DOC cards)

- **DOC-02** — upload flow (presigned-PUT issue + confirm), `document.upload`,
  audited HTTP API + harness registration.
- **DOC-03** — download (presigned GET) + delete + list/filter (incl. by expiry).
- **DOC-04** — virus-scan hook (pluggable, dev pass-through) + retention/PDPL.
- **DOC-05** — documents web UI. Client-rep create-own → Client Portal (5.1).
