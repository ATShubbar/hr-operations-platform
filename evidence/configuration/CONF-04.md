# CONF-04 — Feature flags — Evidence

- Date: 2026-07-22
- Task card: `BACKLOG.md` → CONF-04 (ACTION-PLAN 2.4)
- Status: done
- Commit: `CONF-04: feature flags on the settings substrate (isEnabled + /config/flags)`

## What shipped — flags ARE settings

The elegant "same substrate" approach: **a feature flag is a boolean setting**
under the `flag.` namespace. It resolves, validates, and is toggled through the
exact CONF-01/02 machinery — **zero new tables, zero new write endpoints.**

- **Flag registry** (`domain/catalog.ts`) — flags are catalog entries with a
  `z.boolean()` schema, `default: false`, and levels `[system, client]` (a flag
  may be enabled globally or per client; never per-user — flags are operational,
  not personal). Two initial flags gating upcoming modules:
  `flag.document-expiry-alerts` (3.4), `flag.client-self-service` (5.1).
- **`ConfigService.isEnabled(flag, { clientId? })`** — the read sugar other
  modules call to gate features. Resolves the flag's effective boolean at the
  client scope (or system), coercing to `boolean`. A non-flag key throws (a
  caller asking `isEnabled('calendar.display')` is a bug, not a `false`).
- **`ConfigService.flagsFor(clientId)`** + **`GET /config/flags`** — the resolved
  boolean map (`config.read`).
- **Toggling reuses the existing endpoints** — `PATCH /config/system/:key`
  (System Admin) and `PATCH /config/client/:clientId/:key` (Company Admin) already
  validate against the catalog and audit; a flag is just a `flag.*` key. So flag
  writes are **already gated and audited** with no new surface.

## DoD check

| DoD item | Result |
|---|---|
| Flags default off, listed | ✅ `GET /config/flags` → both `false` |
| Flag toggles through the substrate | ✅ `PATCH /config/system/flag.document-expiry-alerts {true}` → 200, `level: system` |
| `isEnabled` reflects the toggle | ✅ `isEnabled('flag.document-expiry-alerts')` → true |
| Flag value must be boolean | ✅ `{value:'yes'}` → **400** (boolean schema) |
| Per-client flag resolution (client→system) | ✅ enabled for A only: `isEnabled(flag,{A})`=true, `{B}`=false, system=false |
| `isEnabled` rejects a non-flag key | ✅ `isEnabled('calendar.display')` throws |
| Flag writes audited | ✅ audit `after` carries the `flag.*` key (via the existing `system-set`/`client-set` actions) |
| No new tables / write endpoints | ✅ reuses `cfg_system_settings`/`cfg_client_settings` + `PATCH /config/{system,client}` |
| Coverage gates green | ✅ isolation (+1 route `GET /config/flags`), catalog, write-audit (no new writes) |
| `lint typecheck test build` green | ✅ lint+typecheck clean; API build clean; **suite 144/144** (+6) |

## Test output (`test/configuration-flags.e2e-spec.ts`, 6/6)

```
✓ GET /config/flags lists the flags, defaulting to false
✓ a flag toggles through the EXISTING system endpoint (rides the substrate)
✓ a flag value must be boolean → 400
✓ per-client flag override resolves per client (client → system)
✓ isEnabled rejects a non-flag key (a bug, not a false)
✓ flag toggles are audited on the config resource
```

Full suite **144/144** (26 files).

## Live check (running API, port 3001)

```
GET /config/flags   → {"flags":{"flag.document-expiry-alerts":false,"flag.client-self-service":false}}
GET /config/catalog → flag descriptors present: flag.document-expiry-alerts, flag.client-self-service
```

## Design decisions recorded

- **A flag is a boolean setting** — rather than a parallel flag registry + tables
  + endpoints, flags live in the catalog under `flag.*`. They inherit resolution,
  validation, per-client override, and audited toggling for free. This is the
  literal "same substrate" the epic called for, and the least code.
- **`isEnabled()` is the consumer contract** — other modules gate features by
  calling `ConfigService.isEnabled(flag, { clientId })`, not by reading raw
  settings. It coerces to boolean and rejects non-flag keys so misuse is loud.
- **No user tier for flags** — flags are `[system, client]`; a feature being on
  is not a personal preference.
- **Flags surface in `/config` and `/config/catalog`** — they are configuration,
  so they appear alongside settings; `/config/flags` is the filtered boolean
  convenience view.

## Deferred

- **Web settings UI** (system settings + flags admin + per-user prefs) → CONF-05,
  the last card of the epic.
- First real `isEnabled` consumer arrives with the module a flag gates (e.g. the
  document-expiry engine, 3.4).
