# CONF-03 — Per-user preferences + full three-level resolution — Evidence

- Date: 2026-07-22
- Task card: `BACKLOG.md` → CONF-03 (ACTION-PLAN 2.4)
- Status: done
- Commit: `CONF-03: configuration per-user preferences + full user→client→system resolution`

## What shipped — the three-level model, completed

CONF-03 adds the **user** tier and closes the resolution: `user → client → system`
(most specific wins), the model architecture.md §Localization specifies.

- **`cfg_user_settings`** — per-user preferences, keyed `(user_id, key)`.
  **User-owned, not client-owned**, so — like `auth_users` — a **system table
  with NO RLS**: isolation is **application-enforced** (every query filters by
  the caller's context `actorId`, never request input). Grants to `app_staff`
  only; a client-rep's own-pref operations run through the Configuration service
  on the staff connection (the row is scoped by actor, not client).
- **Full resolution** (`ConfigService.getEffectiveForActor`) — composes
  system → client (if the caller has a client) → user, so a client-rep sees all
  three tiers and a staff user sees `user → system`. Actor identity comes from
  the request context; **a user can only ever touch their own preferences.**
- **`/config/me`** — any authenticated principal:
  - `GET /config/me` — the caller's fully-resolved settings (`config.read-self`)
  - `PATCH /config/me/:key` — set an own preference (`config.write-self`, audited)
  - `DELETE /config/me/:key` — clear it, reverting to the lower tier (client if
    present, else system) (`config.write-self`, audited)
- **New permissions `config.read-self` + `config.write-self`** — held by **every
  role** (staff `STAFF_BASE` + client `ALL_CLIENT`); self-service is universal.
- **New isolation-harness scope class `self`** — self-service endpoints operating
  on the caller's own identity (any principal); the harness asserts 401-on-unauth,
  own-actor scoping is proven per-endpoint here.

## DoD check

| DoD item | Result |
|---|---|
| Per-user override wins (user→…→system) | ✅ set `ui.language=en` → `/config/me` shows `en` |
| Full three-tier resolution for a client-rep | ✅ rep sees `calendar.display=gregorian` (client) + `ui.language=en` (user) over system |
| Staff caller = user→system (no client tier) | ✅ staff `/config/me` calendar.display stays `dual` |
| Non-user-level setting rejected | ✅ `calendar.display` (levels [system,client]) → **400** "no user level" |
| Invalid value / unknown key | ✅ `ui.language=fr` → 400; unknown key → 404 |
| Per-user isolation | ✅ staffA's pref does not affect staffB (`ar` unchanged) — app-enforced by actorId |
| Actor from session, never input | ✅ no actorId in the URL; `/config/me` reads context only |
| Clear reverts to lower tier | ✅ clear `ui.language` → returns system `ar` |
| Writes audited, attributed to the actor | ✅ `user-set` + `user-clear`; entries carry the setter's `actorId` |
| Coverage gates green | ✅ isolation (new `self` class, 3 routes), catalog (`config.read-self`/`write-self`), write-audit (`config.user-set`/`user-clear`) |
| `lint typecheck test build` green | ✅ lint+typecheck clean; API build clean; **suite 138/138** (+8) |

## Test output (`test/configuration-me.e2e-spec.ts`, 8/8)

```
✓ staff /config/me starts at system defaults
✓ staff sets a per-user preference; /config/me reflects it, then clears back
✓ a setting with no user level → 400; invalid value → 400; unknown key → 404
✓ preferences are per-user — one user does not affect another
✓ unauthenticated → 401
✓ client-rep resolution composes user over client over system
✓ per-user writes are audited, carrying the actor id
```

Full suite **138/138** (25 files).

## Live check (running API, port 3001)

```
GET   /config/me                       → system defaults (ui.language: ar)
PATCH /config/me/ui.language {en}       → {"key":"ui.language","level":"user","value":"en"}
GET   /config/me                       → ui.language: en
PATCH /config/me/calendar.display       → 400 (no user level)
DELETE /config/me/ui.language           → {"key":"ui.language","level":"system","value":"ar"}
```

## Design decisions recorded

- **User-owned → app-enforced isolation, no RLS** — `cfg_user_settings` follows
  the `auth_users` precedent (CLIENT-03): keyed by actor, filtered by the
  context `actorId` on every query, never by request input. RLS is for
  client-scoped data; this is actor-scoped.
- **Actor from the session, not the URL** — `/config/me` has no `:userId`; the
  service reads `requestContext`. A user structurally cannot address another
  user's preferences.
- **New `self` scope class** — the existing harness classes are staff- or
  client-scoped; per-user self-service is neither, so rather than mislabel it as
  `staff`, a `self` class documents the invariant (any principal, own data, 401
  on unauth) and the harness enforces the 401.
- **Self-service perms are universal** — `config.read-self`/`config.write-self`
  are held by every role; managing your own UI language is not a privilege.

## Not yet exercised (honestly noted)

- **user > client precedence on a single setting** — no catalog setting currently
  declares BOTH a `client` and a `user` level (`calendar.display` is [system,
  client]; `ui.language` is [system, user]), so the user-beats-client case can't
  be shown on one key today. The resolution applies the user tier last, so it
  *would* win; the composition test proves client and user tiers coexist.
- **Client-rep reading own via the RLS path** — `/config/me` uses the staff
  connection (actor-scoped), so `cfg_client_settings`' client RLS policy is still
  reserved for the future portal read path (5.1).

## Configuration epic status

**Three-level model complete: CONF-01 (system) + CONF-02 (client) + CONF-03
(user).** A caller now gets one fully-resolved effective view. Remaining:
CONF-04 (feature flags), CONF-05 (web settings UI). Consumer-wiring (e.g.
EMP-03's date display driven by `calendar.display`) is now unblocked.
