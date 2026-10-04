# SEED-01 — Seeded documents (and sample request files) have real files — Evidence

- Date: 2026-10-04
- Card: `BACKLOG.md` → SEED-01 (found in DS-20; widened in THREAD-02). Status: **done locally and in CI**. UAT is proven by the next **Seed UAT** run (owner).

## Owner decisions

| Question | Answer |
|---|---|
| How does the UAT seed job reach the bucket? | **Share the app's key** (recommended): let `uat-seed` read the two existing storage secrets. Nothing new created. |
| Sample attachments on seeded requests too? | **Yes, two files** (recommended). |

## Cloud change (owner-approved, run by me)

```
gcloud secrets add-iam-policy-binding uat-storage-access-key  --member=serviceAccount:uat-seed@… --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding uat-storage-secret-key  --member=serviceAccount:uat-seed@… --role=roles/secretmanager.secretAccessor
```

Result: each secret is readable by exactly `uat-run` and `uat-seed`. Two bindings; nothing created; no cost. Recorded in `docs/PROVISIONING-GCP.md` (the `uat-seed` description and the status log).

Checked read-only first:
- the HMAC key belongs to `uat-run`, which holds `storage.objectAdmin` on `peoplegro-uat-documents`;
- before this change, both secrets were readable by `uat-run` only.

## What was built

| Piece | What |
|---|---|
| `prisma/seed-files.ts` | `buildSamplePdf(lines)`: a valid one-page PDF (Helvetica; xref offsets computed, not hand-counted; non-ASCII replaced). It reads "PEOPLE&GRO - sample document", then the title, the type, and "Sample data - not a real document."<br>`SeedFiles`: put/remove through the same S3-compatible API and bucket rule as the app's `StorageService` (ADR-010 clause 3). |
| `prisma/seed-guard.ts` `seedStorageFor(env)` | Development/CI: the app's local MinIO defaults. **UAT (production mode): every `STORAGE_*` setting must be supplied or the seed refuses**, so UAT can't be seeded silently without files. The password guard still runs first, at import: a real production environment is refused before storage is touched. |
| `prisma/seed.ts` | Every seeded document gets its PDF at its storage key, with its real `sizeBytes`.<br>**Two sample attachments**: "Al Rajhi salary letter template.pdf" by client manager A on the salary-certificate request, and "Absher receipt - iqama renewal.pdf" by the GRO officer on the iqama renewal.<br>Re-seeding removes every file on the seeded requests (rows + blobs), as it does their comments, then writes the two again. |
| CI (`ci.yml`) | **MinIO now starts BEFORE the seed**; it used to start after, when only the document specs needed it. |
| `uat-seed.yml` | The seed job gets `STORAGE_ENDPOINT/REGION/BUCKET` **read from `infra/gcp/uat-env.yaml`** (the same file the app's deploy uses, so the two can't disagree) plus the two storage secrets. |
| UAT smoke | Two new checks: a **seeded** document and the **seeded** attachment each download as a PDF. |

## Tests

`test/seed-guard.e2e-spec.ts`: **7/7**, 2 new.
- **Storage config:** development falls back to local MinIO; UAT with nothing supplied → refuses naming `STORAGE_ENDPOINT`; fully supplied → used; missing only the secret → refuses naming `STORAGE_SECRET_KEY`.
- **The PDF:** `%PDF-1.4` header and `%%EOF`; a `/Type /Page`; **every xref entry points exactly at its `N 0 obj`**; `startxref` points at the table; the em dash in "Iqama — Syed Ali" became "-"; no byte above 0x7F.
- Run red first: the module didn't exist.

**Full API suite: 647/647** (645 + 2). Lint caught `no-control-regex` on my first byte check (`/[^\x00-\x7f]/`); it is now `pdf.every((byte) => byte < 0x80)`. `@hr/api` lint + typecheck green.

## Verified (local)

- Seed: "20 documents (with files) … 2 request files".
- As HR, **all 20 of 20 seeded documents** download (presigned URL → 200) and begin `%PDF-`. Before this, Download answered `NoSuchKey` on seed data (found in DS-20).
- **The browser's own PDF viewer renders one** ("PEOPLE&GRO - sample document · Fleet Insurance Policy · Type: other · Sample data - not a real document.", 1 page).
- The iqama-renewal request's Attachments block shows "Absher receipt - iqama renewal.pdf · Turki Al-Harbi · 4 Oct · 1 KB".
- The smoke script run locally: both new checks pass, and all checks passed.

Data cleaned: the smoke run's requests removed and the DB re-seeded.

## For UAT

The next **Seed UAT** (`seed-and-smoke`) writes the files to `peoplegro-uat-documents`. Its smoke step checks that a seeded document and the seeded attachment download as PDFs. The bucket check the seed performs is the same one the app already performs on every UAT upload with this key.
