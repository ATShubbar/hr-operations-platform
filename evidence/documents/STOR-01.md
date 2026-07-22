# STOR-01 — Storage shared module (S3-compatible adapter) — Evidence

- Date: 2026-07-22
- Task card: `BACKLOG.md` → STOR-01 (ACTION-PLAN 3.2)
- Status: done
- Commit: `STOR-01: S3-compatible storage adapter + MinIO (presigned round-trip)`

## What shipped

The shared **Storage** module — a provider-agnostic S3-compatible object-store
adapter, the foundation the Documents module (DOC-01+) builds on.

- **`StorageService`** (`modules/storage/application/storage.service.ts`) on AWS
  SDK v3:
  - `keyFor(clientId, …parts)` — **per-client key prefix** (`clients/<clientId>/…`),
    the storage analogue of the `client_id` isolation boundary.
  - `presignUpload(key, contentType)` — short-lived PUT URL; the client uploads
    bytes **directly to the store**, the API never proxies them.
  - `presignDownload(key)` — short-lived GET URL.
  - `deleteObject(key)`; plus server-side `putObject`/`getObject` for the future
    scan hook (DOC-04) and tests.
  - Lazy, memoized `ensureBucket()` (HeadBucket → CreateBucket on 404).
- **Provider-agnostic** — endpoint/region/bucket/keys come from `STORAGE_*` env
  (`forcePathStyle: true` for self-hosted S3). The same code runs against **MinIO
  locally** and the KSA-hosted store in production; the provider itself stays
  ADR-006's open item — only `STORAGE_ENDPOINT`/keys change.
- **Local infra** — a `minio` service in `docker-compose.yml` (host ports
  9002/9003, per the project's avoid-default-ports convention); `STORAGE_*` in
  `.env.example` + `apps/api/.env` and declared in `turbo.json globalEnv` (the
  Turbo-strict-env landmine).
- `StorageModule` is `@Global` (infrastructure, like Prisma); no controllers —
  it is a pure adapter, so nothing to register in the isolation/audit harnesses.

## DoD check

| DoD item | Result |
|---|---|
| Presigned upload+download round-trip against MinIO | ✅ PUT via signed URL → GET via signed URL → identical bytes |
| Signed URLs are genuine SigV4 | ✅ URL contains `X-Amz-Signature` |
| Per-client key prefixing | ✅ `keyFor(c, 'a', 'b.pdf')` → `clients/<c>/a/b.pdf` |
| Server-side put/get (scan-hook path) | ✅ round-trips |
| Delete removes the object | ✅ subsequent download → 404 (NoSuchKey) |
| Endpoint-agnostic (no hardcoded AWS) | ✅ all config from `STORAGE_*` env; `forcePathStyle` |
| Env declared in turbo globalEnv | ✅ (5 `STORAGE_*` keys) |
| `lint typecheck test build` green | ✅ API build clean; **suite 148/148** (+4) |

## Test output (`test/storage.e2e-spec.ts`, 4/4)

```
✓ keys are per-client prefixed
✓ presigned PUT uploads, presigned GET downloads the same bytes
✓ server-side put/get round-trips (used by the future scan hook)
✓ delete removes the object (subsequent download 404s)
```

MinIO liveness confirmed: `GET http://localhost:9002/minio/health/live → 200`.
Full suite **148/148** (27 files).

## Design decisions recorded

- **Presigned, direct-to-store transfer** — the API signs URLs; bytes never flow
  through the API process. This is the architecture's "presigned uploads" and
  keeps the API stateless for large blobs.
- **Provider is config, not code** — one adapter, endpoint-configurable. The KSA
  vs OCI production choice (ADR-006, still open under the AWS block) does not
  gate local progress; prod is a `STORAGE_ENDPOINT` + key change.
- **Per-client prefixes** — `clients/<clientId>/…` mirrors row-level isolation at
  the blob level; the Documents module will scope every key through `keyFor`.
- **No compose healthcheck for MinIO** — the image ships neither curl nor a
  configured `mc` alias, so any check would false-fail; nothing in compose gates
  on it, and the adapter ensures the bucket lazily.

## Deferred (to the Documents cards)

- **DOC-01** — `doc_documents` client-scoped table (metadata + `expiryDate`
  first-class) + `DocumentsService`.
- **DOC-02** — upload flow (presigned-PUT issue + confirm), `document.upload`.
- **DOC-03** — download/delete/list HTTP endpoints, audited + harness-registered.
- **DOC-04** — virus-scan hook (pluggable, dev pass-through; ClamAV deferred) +
  retention/PDPL hooks.
- **DOC-05** — documents web UI.
