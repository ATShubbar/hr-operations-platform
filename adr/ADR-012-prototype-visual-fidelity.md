# ADR-012 — Pixel-exact fidelity to the People & Gro prototype

- Status: Accepted
- Date: 2026-10-03
- Owner: Ahmed Alshubbar (product decision)
- Revises: **ADR-005 (Localization)** — the requirement that Arabic renders in a right-to-left
  LAYOUT. Also supersedes the DS-01 decision to keep our own AA status colours.

## Context
The owner designed the console in Claude Design: a design system plus a 16-screen interactive
prototype, now versioned in `design/` (540 KB). After seeing the running platform the owner
directed that the product match the prototype **exactly — design, pages and functionality**.

The prototype is **English-only and left-to-right**, and its soft status badge sets the label in
the mid-strength status hue on a 10% tint of the same hue — measured at **2.86–4.13:1**, below
WCAG AA's 4.5:1 for text (`apps/web/scripts/verify-status-contrast.mjs`).

The platform has, until now, treated Arabic as the default locale with a mirrored RTL layout
(ADR-005, architecture "Non-Negotiable Principles": *"Arabic/English localization is a core
architectural requirement"*), and kept AA-passing status tones (UX-01, DS-01).

The owner was asked directly whether "exactly" should override RTL layout and AA contrast,
with keeping them recommended, and chose the **pixel-exact copy**.

## Options considered
1. **Same design, kept bilingual** — the prototype's structure and components, mirrored for
   Arabic, badge colours nudged to pass AA. (Recommended; declined.)
2. **Pixel-exact copy** — the prototype's layout and colours literally, in both languages.
   (Chosen.)

## Decision
- **Layout direction is LEFT-TO-RIGHT in both locales.** The document's `dir` is `ltr` for `en`
  and `ar` alike, and Base UI's DirectionProvider follows. Arabic TEXT still flows right-to-left
  inside its own lines (Unicode bidi), and every string remains translated — **Arabic stays a
  supported language**; what changes is that the screen is not mirrored.
- **Status pills use the prototype's soft badge colours** (status hue on its own 10% tint),
  accepting that they measure below AA. The measurement stays in the contrast script as a
  record of the trade-off.
- **What is NOT changed, and why:**
  - **Fonts.** The prototype's Geist/Inter have no Arabic glyphs; Arabic keeps IBM Plex Sans
    Arabic through the composed stacks (UX-08) — otherwise Arabic would render in whatever
    each machine falls back to.
  - **The PEOPLE&GRO logo** stays the real mark; the prototype's "P" tile was a placeholder
    (its own design notes say the designer did not have the logo).
  - **The language switcher** stays in the header (the prototype has none; without it Arabic
    cannot be chosen).
  - **Logical Tailwind utilities stay mandatory** (`hr/rtl-safe-classes`). They cost nothing in
    an LTR document and keep the RTL layout one attribute away if this decision is ever
    reversed.
- Elements of a prototype screen that have no backend yet are **shown, marked "coming soon"**
  (owner decision) — never filled with invented data.

## Consequences
- Arabic readers get a left-to-right screen: navigation on the left, Arabic text right-aligned
  within left-anchored blocks. This is the owner's accepted trade-off for fidelity.
- Every `rtl:` variant in the web app stops applying (e.g. the 14px Arabic table text from
  DS-03 becomes the prototype's 13px; mirrored icons stop mirroring). Each is removed or left
  inert as the screen cards pass over it.
- Status colour is now below AA for text; colour is still never the only signal (every pill
  has its label and a dot), so WCAG 1.4.1 is still met — 1.4.3 contrast is not.
- **Reversal is cheap by design:** set `dir` back from the locale and restore the status tones.

## Links
- ADR-005 (localization) — revised here on layout direction only
- `design/People & Gro console design (1)/People & Gro Console.dc.html` — the source of truth
- `BACKLOG.md` → DS epic, owner decisions round 2; `evidence/ux/DS-04.md`
