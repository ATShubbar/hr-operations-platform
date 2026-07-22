# CONF-05 — Configuration settings web UI — Evidence

- Date: 2026-07-22
- Task card: `BACKLOG.md` → CONF-05 (ACTION-PLAN 2.4)
- Status: done
- Commit: `CONF-05: settings web UI (preferences + system settings + flags) — closes Configuration epic`

## What shipped — the resolution made visible

The first place the three-level model is user-visible: a **Settings page** where
every user manages their own preferences, and System Admins edit system settings
and toggle feature flags. Consumes the full CONF-01..04 API.

- **Settings page** (`(app)/settings/page.tsx`):
  - **My preferences** (everyone) — a preferred-language control bound to the
    caller's `ui.language` (from `GET /config/me`). Choosing a language persists
    it (`PATCH /config/me/ui.language`) **and switches the app locale** so it
    applies immediately — the language-switch wiring.
  - **Applies to you** (everyone) — the resolved effective values (calendar
    display, timezone, working week) from `GET /config/me`: the `user → client →
    system` resolution shown to the user.
  - **System settings** + **Feature flags** (System Admin only, `config.write`) —
    calendar-display select, timezone input, and a toggle per flag; each writes
    through the existing `PATCH /config/system/:key`.
- **Language-switch wiring** — the header `LanguageSwitcher` now persists
  `ui.language` on toggle (fire-and-forget; the login page's unauth 401 is
  ignored), and the post-login landing (`goToApp`) reads `/config/me` and lands
  the user **in their preferred language**.
- **Nav** — a "Settings" item shown to every authenticated principal
  (`config.read-self`); RTL + ar/en via the `settings` message namespace.

## DoD check — verified in-browser (real sessions through the proxy)

| DoD item | Result |
|---|---|
| Preferences visible to all; system section gated | ✅ finance sees preferences + applies, **no** system section; system_admin sees both |
| Preferred language reads current + persists | ✅ shows "Arabic"; select → `PATCH /config/me/ui.language` + locale switch |
| Resolved settings shown | ✅ "Applies to you": Dual (Hijri & Gregorian), Asia/Riyadh, Sun–Thu |
| System settings editable (System Admin) | ✅ calendar-display select + timezone input + Save over `/config/system/:key` |
| Feature-flag toggle | ✅ click Enable → `flag.document-expiry-alerts` server-side `true`, row shows Disable; reverted to `false` |
| Language-switch → ui.language | ✅ header switcher persists; login lands in the stored language |
| ar/en + RTL | ✅ Arabic labels, gold theme; working-week separator locale-aware |
| `typecheck` + `lint` green | ✅ `@hr/web` clean |

## Screens verified

- `/en/settings` as **finance** (non-admin): My preferences (language: Arabic) +
  Applies to you (Dual / Asia/Riyadh / Sun–Thu); **no** System section (no
  `config.write`). Nav shows Settings.
- `/en/settings` as **system_admin** (MFA-enrolled full session): all of the
  above **plus** System settings (calendar select = "Dual (Hijri & Gregorian)",
  timezone = Asia/Riyadh + Save) and Feature flags (both flags with descriptions
  + Enable buttons).
- **Live flag toggle**: Enable `flag.document-expiry-alerts` → `GET /config/flags`
  returns it `true`, button flips to Disable; reverted to `false`.

## Design decisions recorded

- **Preference persistence is the wiring** — choosing a language writes
  `ui.language` and switches the locale; the header switch does the same; login
  honors the stored value. The setting is not write-only — it drives what the
  user sees.
- **Data-driven where cheap, hardcoded where heterogeneous** — flags render from
  `GET /config/flags` + descriptions from `/config/catalog`; the system editors
  (enum select, string input) are typed for the known settings. Array-typed
  settings (`working.week`, `ui.languages`) are shown read-only under "Applies to
  you"; dedicated editors for them are a fast-follow.
- **`SelectValue` render function** — Base UI's `Select.Value` shows the raw
  value unless given a render function; the language and calendar selects map
  value → label explicitly.

## Deferred (stated)

- Editors for array-typed system settings (`working.week` weekday picker,
  `ui.languages` set) — read-only for now.
- Per-client settings admin in the clients console (staff manage a client's
  overrides) — the CONF-02 API exists; the UI is a fast-follow.
- Client-rep settings surface → Client Portal (5.1).

## Configuration epic — COMPLETE

CONF-01 (system) + CONF-02 (client) + CONF-03 (user) + CONF-04 (flags) + CONF-05
(web UI). ACTION-PLAN 2.4 is done: the three-level settings model, feature flags,
and the settings UI, all with evidence. API suite **144/144**; web typecheck +
lint green.
