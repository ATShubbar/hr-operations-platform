# ADR-005 — Localization: configurable, Saudi defaults

- Status: Accepted
- Date: 2026-07-18 (rev. 1, same day: setting levels made explicit — system / per-client / per-user)
- Owner: TBD

## Context
The platform serves Saudi Arabia first (Arabic/English, RTL, Hijri dates on government documents, Sunday–Thursday week) with future GCC expansion. Retrofitting RTL or dual-calendar handling into a mature UI is weeks of rework; hardcoding Saudi conventions blocks expansion. Localization must therefore be structural from day one and configurable rather than compiled in.

## Options considered
1. **Hardcode Saudi conventions.** Fastest now; every future market becomes a code change scattered across modules. Rejected.
2. **Full per-user localization of everything, including calendar storage.** Storing Hijri (or mixed) dates poisons every comparison, sort, and integration. Rejected.
3. **Configuration-driven localization with fixed invariants.** Conventions (language, calendar display, working week, timezone, formats) are settings with Saudi defaults; storage and structure rules are invariant.

## Decision
Option 3:
- **Configurable via the Configuration module at three explicit levels** — every setting declares its level:
  - **System** (deployment-wide, System Admin): the default for every setting — UI language set (default ar/en), calendar display per context (Hijri/Gregorian/dual), working week (default Sun–Thu), timezone (default Asia/Riyadh), number/date formats.
  - **Per-client** (override on the client company record, set by consultancy staff — never by the client): calendar display, working week, timezone.
  - **Per-user** (personal preference): UI language choice.
  - Precedence where an override is permitted: **user → client → system**. A setting without a declared override level cannot be overridden — the Configuration API rejects the attempt rather than silently falling back.
- **Invariant:** storage is always Gregorian UTC — Hijri is a render/input concern handled by one shared utility in Configuration; Tailwind logical properties only (physical `left/right` utilities lint-blocked); all user-facing strings externalized; person/company names and job titles stored as Arabic/English pairs.
- shadcn/ui components are verified in RTL before adoption (walking skeleton DoD 1.4).

## Consequences
- GCC expansion (different week, timezone, calendar emphasis) is configuration, not code.
- Every module reads conventions through the Configuration service; hardcoding a convention is a review-blocking defect.
- Bilingual fields roughly double name-type columns and require both values at data entry (or a transliteration-assist workflow later).
- The RTL lint rule and string-externalization check must exist in CI before the first screen is built.

## Links
- `architecture.md` — Localization (Core Requirement)
- `ACTION-PLAN.md` 0.5, 1.4
