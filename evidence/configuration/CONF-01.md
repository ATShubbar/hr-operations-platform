# CONF-01 — Settings catalog + system-level resolution + system API — Evidence

- Date: 2026-07-22
- Task card: `BACKLOG.md` → CONF-01 (ACTION-PLAN 2.4)
- Status: done
- Commit: `CONF-01: configuration module — settings catalog + system-level resolution + API`

## What shipped

The Configuration module's foundation: the **settings catalog** (the contract for
the three-level model) + **system-level** resolution + a System-Admin write API.

- **Catalog** (`domain/catalog.ts`) — the single source of truth. Each setting
  declares `{ key, schema (zod), default, levels, description }`. The initial
  five, straight from architecture.md's localization table:

  | key | type | default | levels |
  |---|---|---|---|
  | `calendar.display` | `hijri\|gregorian\|dual` | `dual` | system, client |
  | `working.week` | weekday set (0=Sun…6=Sat) | `[0,1,2,3,4]` (Sun–Thu) | system, client |
  | `timezone` | IANA (validated via `Intl`) | `Asia/Riyadh` | system, client |
  | `ui.languages` | available set | `[ar, en]` | system |
  | `ui.language` | `ar\|en` | `ar` | system, user |

  `levels` declares CAPABILITY — which levels may hold a value. CONF-02/03 add the
  client/user resolution layers; the declarations live here so those cards are
  pure additive layers.

- **`ConfigService`** (`application/config.service.ts`) — `get(key)` and
  `getAll()` resolve the **system level**: stored override (`cfg_system_settings`)
  `?? ` the catalog's coded default. `setSystem(key, value)` validates against the
  setting's catalog schema and upserts, **audited in the same transaction**
  (AUDIT-03 pattern). Unknown key → `404`; value failing the schema → `400` —
  errors, never a silent fallback (architecture.md: "attempting to override is a
  Configuration API error").

- **API** (`api/config.controller.ts`) — per-key PATCH (owner decision):
  - `GET /config` — effective settings (`config.read`)
  - `GET /config/catalog` — the descriptors (`config.read`)
  - `PATCH /config/system/:key` — set a system value (`config.write`, System Admin, audited)

- **Storage** — `cfg_system_settings` (key PK, JSONB value). Deployment-wide, so —
  like `auth_users` — a **system table with NO RLS**. Grants: `SELECT` to both
  runtime roles, `INSERT/UPDATE` to `app_staff` only, **no DELETE to any runtime
  role** (settings are upserted, never row-deleted).

- **Permissions** — `config.read` (all staff, via `STAFF_BASE`) + `config.write`
  (System Admin **only** — the matrix's "power is config"). Registered in the
  isolation harness (`staff`) and audited-writes (`config.system-set`).

## DoD check

| DoD item | Result |
|---|---|
| Catalog drives validation | ✅ zod schema per setting; `Intl`-validated timezone; weekday-set for working week |
| System get/set works; effective reflects override | ✅ set `calendar.display=hijri` → `GET /config` shows `hijri` |
| Unknown key → 404 (not silent) | ✅ `PATCH /config/system/nope.notasetting` → 404 |
| Invalid value → 400 | ✅ `calendar.display=martian` → 400; `timezone=Not/AZone` → 400 |
| Write is System-Admin-only | ✅ hr_officer (has `config.read`) → **403**; system_admin → 200 |
| Writes audited, non-sensitive value recorded | ✅ `resource=config, action=system-set`; snapshot carries the key/value (settings aren't secrets) |
| `config.read` broad | ✅ held by all staff (STAFF_BASE) |
| Coverage gates green | ✅ isolation (3 routes), catalog-coverage (`config.read/write`), write-audit (`PATCH /config/system/:key`) |
| Existing suite survives | ✅ auth-policy/authz/employees/clients all green |
| `lint typecheck test build` green | ✅ turbo lint+typecheck 10/10; API build clean; **suite 122/122** (+9) |

## Test output (`test/configuration-api.e2e-spec.ts`, 9/9)

```
✓ staff reads EFFECTIVE settings → catalog defaults
✓ staff reads the CATALOG (levels declared per setting)
✓ unauthenticated → 401
✓ non-admin staff cannot write system settings → 403
✓ System Admin sets a system setting; effective value reflects it
✓ validated against the catalog schema — array + IANA timezone accepted
✓ unknown setting key → 404 (not a silent fallback)
✓ invalid value for a known setting → 400
✓ system writes are audited (resource=config, action=system-set)
```

Full suite: **122/122** (23 files). Coverage gates (catalog / write-audit /
isolation) green.

## Live check (running API, port 3001)

```
GET /config            → {"settings":{"calendar.display":"dual","working.week":[0,1,2,3,4],
                            "timezone":"Asia/Riyadh","ui.languages":["ar","en"],"ui.language":"ar"}}
GET /config/catalog    → 5 descriptors with declared levels
PATCH /config/system/timezone as finance (config.read, not config.write) → 403
```

## Design decisions recorded

- **Catalog-as-code** — settings are a typed registry, not free-form rows. The
  catalog is what makes "override a non-permitted level" and "unknown key" hard
  errors. `cfg_system_settings` only stores *overrides of a coded default*.
- **System table, no RLS** — system settings are deployment-wide (not client-
  owned), so the table follows the `auth_users` pattern, not the client-scoped
  checklist. It still registers in the isolation harness (as `staff`) so coverage
  stays enforced.
- **Non-sensitive audit** — unlike salary/govdata, setting values ARE recorded in
  the audit snapshot (a timezone or calendar mode is not a secret).
- **Per-key PATCH** (owner decision) — one validated value, one audit entry;
  CONF-02/03 mirror the shape at `/config/client/:key`, `/config/me/:key`.
- **`zod` added as a direct API dependency** — the catalog defines validators; the
  API previously consumed only compiled `@hr/contracts` schemas.

## Deferred

- **Per-client** overrides + client→system precedence → CONF-02.
- **Per-user** preferences + full user→client→system resolution + `/config/me` → CONF-03.
- **Feature flags** → CONF-04. **Web settings UI** → CONF-05.
- **Consumer wiring** — e.g. EMP-03's hardcoded dual-calendar display driven by
  `calendar.display`; happens once client/user resolution exists (CONF-02/03).
