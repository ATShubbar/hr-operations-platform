# DOC-05 — Documents web UI — Evidence

- Date: 2026-07-22
- Task card: `BACKLOG.md` → DOC-05 (ACTION-PLAN 3.2)
- Status: done
- Commit: `DOC-05: documents web UI (list + expiry view + presigned upload/download)`

## What shipped — the first user-visible documents surface

A documents console over the DOC-02/03 API, and the first place the presigned
flow runs from a real browser.

- **Documents page** (`(app)/documents/page.tsx`):
  - **List** — title, category, **status badge**, **dual-calendar expiry**
    (Hijri · Gregorian via `@hr/dates`), with per-row **Download** (available
    docs) and **Delete** (gated `document.delete`).
  - **Filters** — client, category, and **"expiring before"** (the expiry view),
    applied server-side via the DOC-03 query params.
  - **Upload** (gated `document.upload`) — a dialog that runs the presigned
    two-step flow **from the browser**: `POST /documents` (issue) → **PUT the
    file bytes directly to object storage** (not through the app or API) →
    `POST /documents/:id/confirm`.
  - **Download** — `GET /documents/:id/download` → opens the short-lived
    presigned URL in a new tab.
- **Nav** — a "Documents" item gated on `document.read` (all staff); ar/en + RTL
  via the `documents` message namespace.

## DoD check — verified in-browser (real sessions through the proxy)

| DoD item | Result |
|---|---|
| List renders with status + dual-calendar expiry | ✅ 3 seed docs; "Jumada I 21, 1448 AH · November 1, 2026" etc. |
| Filters (client / category / expiry) | ✅ present and wired to the DOC-03 query |
| Upload runs the presigned flow from the browser | ✅ issue → **PUT direct to MinIO (200, no CORS error)** → confirm (200) |
| Download serves the real blob | ✅ presigned GET returned the exact uploaded bytes |
| Delete works | ✅ DELETE → 200, row removed on reload |
| Capability-gated affordances | ✅ Upload (document.upload), Delete (document.delete), nav (document.read) |
| ar/en + RTL | ✅ Arabic RTL: headers right-aligned, Arabic categories (إقامة/عقد), Hijri expiry in Arabic, gold theme |
| `typecheck` + `lint` green | ✅ `@hr/web` clean |

## Screens / flows verified

- `/en/documents` as **hr_officer** — list (3 seed docs, dual-calendar expiry),
  filters, Upload button, Download + Delete per row.
- **Browser upload round-trip** — issued a `passport` doc, PUT bytes straight to
  MinIO from the page origin (**200 — MinIO's default CORS allows the
  cross-origin PUT**), confirmed → `available`; then downloaded it and got back
  the exact bytes; then deleted it (cleanup).
- `/ar/documents` — RTL layout, Arabic labels + categories, dual-calendar Hijri
  expiry in Arabic, gold theme intact.

## Design decisions recorded

- **Presigned upload from the browser** — the file bytes go **straight to object
  storage**, never through this app or the API (the architecture's presigned
  model, now exercised client-side). The browser → MinIO cross-origin PUT works
  on MinIO's default CORS; a stricter production object store would need its CORS
  configured for the web origin.
- **Expiry view is a first-class filter** — "expiring before" surfaces the
  soon-to-expire documents, the human-facing companion to the engine's query.
- **`SelectValue` render functions** — Base UI shows the raw value without them
  (the CONF-05 landmine); the client/category selects map value → label.

## Not exercised / deferred

- **Seed documents are metadata-only** (no blob) — their Download opens a URL
  that 404s; a browser-uploaded doc downloads correctly (verified). Real blobs
  arrive via the upload flow.
- **DOC-04** — virus-scan hook + retention/legal-hold (PDPL).
- Client-rep documents view → Client Portal (5.1); employee-scoped documents
  view (from an employee's detail page) — a fast-follow.

## Documents + Storage epic (3.2)

STOR-01 (storage) + DOC-01 (registry) + DOC-02 (upload) + DOC-03 (read/download/
delete) + DOC-05 (web UI) done. DOC-04 (scan/retention) is the remaining
enhancement. The document-expiry engine (3.4) now has both its scan target
(`doc_documents.expiryDate`, live in the UI) and a user-facing expiry view.
