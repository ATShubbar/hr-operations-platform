# PORTAL-04 — Client portal web UI — Evidence

- Date: 2026-07-24
- Task card: `BACKLOG.md` → PORTAL-04 (ACTION-PLAN 5.1)
- Status: done
- Commit: `PORTAL-04: client portal web UI — company/employees/documents + nav + login redirect`

## What shipped

The client-facing web experience, over the `/portal/*` API built in PORTAL-01..03.
Front-end only — no API/contract/schema change.

- **Three portal pages** under `(app)/portal/`:
  - `company/page.tsx` — the caller's own company profile card (`GET /portal/company`).
  - `employees/page.tsx` — a **redacted** employees table (`GET /portal/employees`):
    columns are name / job title / department / status / iqama-expiry / work-permit-
    expiry. No salary column, no government identifier-number columns — the API
    redacts them and the table simply has no such columns.
  - `documents/page.tsx` — the own **available** documents table (`GET /portal/
    documents`) with a **Download** button that opens the short-lived presigned URL
    (`GET /portal/documents/:id/download`) in a new tab (the blob never passes
    through this app).
- **Shell nav** (`app-shell.tsx`) — a client-only portal nav section (My company /
  My employees / My documents) gated on `useCan('portal.read')`. Staff never hold
  `portal.read`, so the staff console nav is untouched. Reps keep their existing
  Requests + Settings links.
- **Login redirect fix** (`login/page.tsx`) — a client rep now lands on
  `/portal/company` (their only usable surface) instead of the staff `/clients`
  page they couldn't access (a pre-existing reps-land-on-broken-page bug).
- **Flag-off UX** — each page treats the API's `403` (self-service disabled) as a
  calm "not enabled — contact your consultant" state, not an error.
- **i18n** — `nav.portal*` + a full `portal.*` block in both `en.json` and `ar.json`.

## Browser verification (live, dev servers on API :3001 / web :49286)

Logged in as the seeded client rep `client_admin-a@seed.hr.local` (client A), with
`flag.client-self-service` enabled for client A.

| DoD item | Result |
|---|---|
| Login lands a rep on the portal | ✅ redirected to `/ar/portal/company` (rep's ar preference) |
| Client-only nav — company/employees/documents + requests/settings, NO staff links | ✅ sidebar snapshot: شركتي/موظفيّ/مستنداتي/الطلبات/الإعدادات only |
| Company page shows own company | ✅ "شركة الألف التجارية", status نشط, dual-calendar "7 صفر 1448 هـ · 21 يوليو 2026" |
| Employees redacted (no salary/ID-number columns; expiry shown) | ✅ table columns = name/job/dept/status/iqama-exp/workpermit-exp |
| Redaction confirmed at the API payload | ✅ `GET /portal/employees` → `salary:null`, all govdata **identifiers null**, `iqamaExpiry`/`workPermitExpiry`/`exitReentryStatus`/`gosiRegistrationStatus` **present** |
| Documents lists own AVAILABLE only | ✅ 2 available rows shown; the 3rd non-available doc excluded (DB: 2 available of 3) |
| Download opens a presigned URL | ✅ `/download` → 200; browser opened MinIO URL at key `clients/1111…/documents/…` with `X-Amz-Expires=300` (300s TTL, per-client key) |
| Flag off → "not enabled" message | ✅ toggled flag off → employees page shows "لم يتم تفعيل الخدمة الذاتية لمؤسستك بعد. يرجى التواصل مع مستشارك." (flag restored on after) |
| Both locales render | ✅ AR (RTL, sidebar on the right) + EN (LTR) both verified |
| No console errors | ✅ `preview_console_logs` error level: none |

Notes:
- The MinIO GET after the presigned redirect returns `NoSuchKey` — the seed creates
  document metadata rows but never uploads blob bytes, so there is no object to
  serve. This proves the URL is correctly formed (right bucket `hr-documents`, right
  per-client key, 300s expiry); it is a seed-data artifact, not a UI defect.
- Enabling the flag for the demo was a direct `cfg_client_settings` upsert on the
  local dev DB (client A). Left enabled so the portal stays demoable.

## Static checks

```
pnpm --filter @hr/web typecheck   # tsc --noEmit — clean
pnpm --filter @hr/web lint         # eslint src — clean (logical-only utilities, RTL)
messages/en.json + ar.json          # both parse; no missing-key console warnings
```

## Files

- `apps/web/src/app/[locale]/(app)/portal/{company,employees,documents}/page.tsx` (NEW)
- `apps/web/src/components/app-shell.tsx` (portal nav section, `portal.read`-gated)
- `apps/web/src/app/[locale]/login/page.tsx` (rep → `/portal/company`)
- `apps/web/messages/{en,ar}.json` (`nav.portal*` + `portal.*`)

## Epic status

**Client Portal epic (5.1) COMPLETE** — PORTAL-01 (foundation + company), PORTAL-02
(employees, redacted), PORTAL-03 (documents + download), PORTAL-04 (web UI).
