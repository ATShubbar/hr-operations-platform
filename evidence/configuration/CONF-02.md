# CONF-02 — Per-client setting overrides — Evidence

- Date: 2026-07-22
- Task card: `BACKLOG.md` → CONF-02 (ACTION-PLAN 2.4)
- Status: done
- Commit: `CONF-02: configuration per-client overrides (client→system precedence)`

## What shipped

The **client** tier of the three-level model, layered additively on CONF-01.

- **`cfg_client_settings`** — the first client-scoped table in this module.
  Follows the client-scoped checklist: denormalized `client_id`, GRANTs to both
  roles, RLS enabled with `staff_full_access` + `client_isolation` (the
  load-bearing `NULLIF(current_setting('app.client_id', true), '')::uuid`).
  Composite PK `(client_id, key)` — one override row per setting per client, so
  no sequence to grant.
- **Resolution** (`ConfigService.getAllForClient`) — `client → system`
  precedence: a client override wins over the system value, but **only for
  settings that declare a `client` level** (a stray override on a system-only
  setting is ignored, never applied).
- **API — staff-managed for an explicit client** (architecture.md: per-client
  settings are set by Company Admin, *never by the client themselves*), so the
  path carries `:clientId`:
  - `GET /config/client/:clientId` — client-effective settings (`config.read`)
  - `PATCH /config/client/:clientId/:key` — set an override (`config.write-client`, audited)
  - `DELETE /config/client/:clientId/:key` — clear it, reverting to system (`config.write-client`, audited)
- **New permission `config.write-client`** → **Company Admin only** — distinct
  from CONF-01's `config.write` (System Admin, system level). The two config
  responsibilities are cleanly separated per the matrix.
- `client_id` validated (unknown → 404) via `ClientsService`; audited entries
  scoped to the affected client id.

## DoD check

| DoD item | Result |
|---|---|
| Client override wins over system (client→system) | ✅ set `calendar.display=hijri` for A → A effective `hijri`, system still `dual` |
| Override doesn't leak up to system | ✅ `GET /config` unchanged after a per-client set |
| Per-client isolation | ✅ A override does not affect B (`GET /config/client/B` still default) |
| Non-per-client setting rejected | ✅ `ui.language` (levels [system,user]) → **400** "no client level" |
| Invalid value / unknown key / unknown client | ✅ 400 / 404 / 404 |
| Write is Company-Admin-only | ✅ hr_officer (config.read) → **403**; company_admin → 200 |
| Clear reverts to system | ✅ set → `London`, DELETE → returns system `Asia/Riyadh`, effective reverts |
| Writes audited, scoped to the client | ✅ `client-set` + `client-clear`; every entry carries the affected `clientId` |
| Client-scoped table checklist | ✅ client_id + GRANTs + RLS (both policies, NULLIF) + harness-registered |
| `lint typecheck test build` green | ✅ lint+typecheck clean; API build clean; **suite 130/130** (+8) |

## Test output (`test/configuration-client.e2e-spec.ts`, 8/8)

```
✓ no overrides → client effective equals system defaults
✓ Company Admin sets a per-client override; client effective reflects it, system unchanged
✓ overrides are per-client — client B is unaffected by client A
✓ a setting with no client level → 400 (not a silent fallback)
✓ invalid value → 400; unknown key → 404; unknown client → 404
✓ non-admin staff cannot write per-client overrides → 403
✓ clearing an override reverts the client to the system value
✓ per-client writes are audited, scoped to the client (set + clear)
```

Full suite **130/130** (24 files). Coverage gates (catalog / write-audit /
isolation) green — 3 new routes registered `staff`, 2 new audited writes
(`config.client-set`, `config.client-clear`).

## Live check (running API, port 3001)

```
GET  /config/client/<A>            → all system defaults (no overrides yet)
GET  /config/client/<unknown>      → 404
PATCH /config/client/<A>/timezone as finance (config.read, not write-client) → 403
```

## Design decisions recorded

- **Staff-managed, explicit `:clientId`** — per-client settings are Company
  Admin's, not the client's (architecture.md), so the write path is the staff
  connection and the client id is in the URL, not the request context. This is
  why the endpoints are `staff` class in the isolation harness even though the
  table is client-scoped.
- **RLS shipped now, exercised later** — `cfg_client_settings` carries both
  policies per the checklist; the `client_isolation` policy is defence-in-depth
  for the future client-rep read path (portal / CONF-03+), not used by the
  staff-only CONF-02 endpoints.
- **`config.write-client` ≠ `config.write`** — per-client (Company Admin) and
  system (System Admin) are separate capabilities, matching the matrix's
  explicit level→role assignment.
- **Only `client`-level settings can be overridden per-client** — enforced by
  the catalog (`levels`), so an attempt on a system/user-only setting is a 400,
  not a silent write that resolution would then ignore.

## Deferred

- **Per-user** preferences + full `user → client → system` resolution + `/config/me` → CONF-03.
- **Client-rep read-own effective settings** (uses the RLS `client_isolation`
  policy) → with the Client Portal (5.1), like `client.read`.
- Feature flags → CONF-04; web settings UI → CONF-05.
