# DOC-04 — Virus-scan hook + legal-hold retention — Evidence

- Date: 2026-07-22
- Task card: `BACKLOG.md` → DOC-04 (ACTION-PLAN 3.2)
- Status: done
- Commit: `DOC-04: virus-scan hook (pluggable, EICAR dev scanner) + legal-hold retention`

## What shipped

### Virus-scan hook — runs between upload and `available`

- **Pluggable seam** (`domain/scanner.ts`) — a `DocumentScanner` interface + a
  `DOCUMENT_SCANNER` DI token. Consumers inject the interface; production binds a
  real ClamAV-backed scanner to the token with no other change.
- **Dev pass-through** (`infra/passthrough-scanner.ts`) — flags the industry-
  standard **EICAR** test signature and passes everything else, so the quarantine
  path is exercisable in dev/CI **without ClamAV** (deferred to infra).
- **`confirm` integrates the scan** — after verifying the blob exists, it scans
  the bytes: **clean → `available`** (as before); **infected → the blob is
  removed and the record set `quarantined`** (never served — download of a
  non-`available` doc is already 409). Audited (`quarantine`).

### Legal-hold retention (PDPL)

- **`legalHold` column** on `doc_documents` (default false).
- **`POST /documents/:id/legal-hold`** (`document.delete`, audited) — sets or
  releases the hold (`{ held: boolean }`).
- **`DELETE` refuses a held document** → **409** ("under legal hold"). Legal-hold
  semantics for records tied to government obligations (architecture.md PDPL).

## DoD check

| DoD item | Result |
|---|---|
| Clean upload passes scan → available | ✅ (DOC-02/03 confirm tests still green) |
| EICAR upload → quarantined + blob removed | ✅ status `quarantined`; download → 409 |
| Scanner is pluggable (token + interface) | ✅ `DOCUMENT_SCANNER`; pass-through bound via `useClass` |
| Legal hold blocks deletion | ✅ held → DELETE 409; released → DELETE 200 |
| Legal hold set/release audited | ✅ `legal-hold` + `legal-release`; quarantine audited |
| Coverage gates green | ✅ isolation (+1 `staff` route), write-audit (+`document.legal-hold`) |
| `lint typecheck test build` green | ✅ API build clean; **suite 169/169** (+4) |

## Test output (`test/documents-scan.e2e-spec.ts`, 4/4)

```
✓ a clean upload passes the scan → available
✓ an EICAR upload is quarantined and the blob removed
✓ legal hold blocks deletion until released
✓ scan + hold actions are audited
```

Full suite **169/169** (31 files).

## Live check (running API + MinIO)

```
1) EICAR upload → confirm            → status=quarantined
2) delete while legal-held           → 409
3) delete after hold released        → 200
```

## Design decisions recorded

- **Scan on confirm, at the seam** — the scan sits exactly between "bytes
  uploaded" and "document usable"; an infected blob never becomes downloadable.
  The interface + token mean ClamAV drops in for production with a one-line
  provider swap.
- **EICAR, not a mock boolean** — the dev scanner detects the real, standard test
  signature, so the quarantine path is genuinely exercised (upload the EICAR
  string → quarantined) rather than faked.
- **Quarantine removes the blob** — an infected file is deleted from storage
  immediately; the record survives (status `quarantined`) for audit.
- **Legal hold is a delete guard, not a new lifecycle** — the smallest honest
  PDPL retention hook: a held document simply cannot be deleted until released;
  both transitions are audited.

## Known simplifications / deferred

- The dev scan reads the whole blob into memory (`getObject`) — fine for dev; a
  real ClamAV integration would stream (infra concern).
- Full retention *schedules* (auto-purge after N years, retain-until dates) beyond
  legal-hold → future PDPL work (0.9).
- A legal-hold / quarantine surface in the documents web UI → fast-follow.

## Documents + Storage epic (3.2) — COMPLETE

STOR-01 + DOC-01 + DOC-02 + DOC-03 + DOC-04 + DOC-05. Storage, registry (expiry
first-class), upload (presigned, category-scoped), read/download/delete, virus
scan + legal-hold, and the web UI — all with evidence. The document-expiry engine
(3.4) has its scan target and a user-facing expiry view ready.
