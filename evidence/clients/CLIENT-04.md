# CLIENT-04 — Clients console UI (staff) — Evidence

- Date: 2026-07-21
- Task card: `BACKLOG.md` → CLIENT-04 (ACTION-PLAN 2.5)
- Status: done
- Commit: `CLIENT-04: clients console UI (list + create/edit/archive)`

## What shipped (the second product screen)

- `/[locale]/(app)/clients` — staff clients console over the `client.*` API
  (CLIENT-02), inside the AUDIT-05 app shell:
  - Table: localized name (ar/en by locale), status badge, Edit/Archive per row.
  - **Create/Edit** in a controlled dialog (name ar + en, status select) →
    `POST` / `PATCH /clients`.
  - **Archive** (shown only for active rows) → `DELETE /clients/:id`
    (soft-archive); the row flips to Inactive and the Archive action disappears.
- Sidebar gained a **Clients** nav item (now Clients + Audit log).
- `clients` + `nav.clients` i18n namespaces (ar + en); no hardcoded strings.
- Reuses the existing infra: `/api` proxy, `apiFetch`, app shell, gold
  `base-rhea` theme + Inter. A 401 bounces to `/login`.

## DoD check

| DoD item | Result |
|---|---|
| Clients list renders from the API | ✅ 2 seed companies (Alpha, Beta) |
| Create a client (dialog → POST) | ✅ added "Gamma Logistics Ltd." → 3 rows |
| Archive (DELETE → soft) | ✅ Gamma → Inactive; Archive button removed |
| Localized names (ar/en) | ✅ English names in /en; Arabic names in /ar |
| ar/en + RTL | ✅ Arabic view mirrored (columns reversed, button flipped) |
| Auth-gated (401 → login) | ✅ list/mutations redirect on 401 |
| `lint typecheck build` green | ✅ web 5/5; monorepo turbo 15/15; API suite unchanged 93/93 |

## End-to-end verification (browser)

1. Logged in as **company_admin** through the real login → MFA enroll → verify
   (live TOTP) → session established.
2. `/en/clients` renders the console with the 2 seed clients, gold theme, Inter,
   sidebar (Clients active).
3. **New client** dialog → filled English + Arabic names → Save → "Gamma
   Logistics Ltd." appears (3 rows) — `POST /clients` round-trip.
4. **Archive** Gamma → status "Inactive", Archive action gone — `DELETE`
   soft-archive round-trip.
5. `/ar/clients` → `dir=rtl`, "العملاء", Arabic names, columns mirrored, the
   archived row shows "غير نشط" with Edit only.

(Screenshots: English console + Arabic RTL console.)

## Design decisions recorded

- **Localized name column** picks `name.ar`/`name.en` by the active locale; both
  are always captured in the create/edit form (bilingual, ADR-005).
- **Archive is soft + reversible**, so no destructive confirmation dialog — the
  Archive action is simply hidden once inactive; status can be set back to active
  via Edit.

## Deferred (stated, pending /auth/me)

- **Role-aware UI.** Create/Edit/Archive are shown to every staff user; a
  non-admin who tries a mutation gets a 403 surfaced as an inline error rather
  than the control being hidden. Hiding admin-only actions (and a server-side
  route guard) needs a session/identity endpoint (`/auth/me`) — a fast-follow,
  same gap noted in AUDIT-05.
- **TanStack Query** still not wired (plain `fetch`); the client-users
  management UI (CLIENT-03 API) has no screen yet — a portal concern.
