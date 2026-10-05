# GCAL-04 — Invitation times use the chosen timezone — Evidence

- Date: 2026-10-05
- Card: `BACKLOG.md` → GCAL-04 (found in DS-22c). Status: **done**.

## The bug

`settings/google-calendar.tsx` built the instant with `new Date(form.start)`. A `datetime-local` value has no zone, so the browser read it in **its own** zone, then labelled it with the zone chosen on the form. 10:00 "Asia/Riyadh" typed in a UTC+4 browser left as **06:00Z = 09:00 Riyadh**.

The API was right throughout: it takes an absolute instant plus the zone and the adapter passes both to Google unchanged (`invitation-payload.ts`).

## What was built

| Piece | What |
|---|---|
| `@hr/dates` `zoned-time.ts` | `zonedTimeToUtc(wallClock, timeZone)`, `utcToZonedWallClock(instant, timeZone)` and `isValidTimeZone`. Built on the runtime's `Intl` zone data (no dependency). DST-correct: a wall time that never happens (spring-forward gap) **moves forward** past the gap; one that happens twice (fall-back overlap) takes the **first** occurrence. |
| Schedule form | Converts the start and end with the **chosen** zone. An unknown zone is refused before anything is sent: "That isn't a timezone this browser knows — use an IANA name such as Asia/Riyadh." (ar too). |
| "What leaves the system" | Start/End now read **"2026-10-06 10:00 Asia/Riyadh · 2026-10-06T07:00:00.000Z"**: the time attendees see, beside the exact instant sent. |

No API change.

## Tests

`packages/dates/src/zoned-time.test.ts`: **10/10** (`@hr/dates` 38/38). Run red first (module absent).
- Riyadh 10:00 → 07:00Z; Dubai → 06:00Z.
- London summer (+1) vs winter (0).
- Crossing midnight (00:30 Riyadh = 21:30Z the day before).
- **New York spring-forward gap** 02:30 → 07:30Z (03:30 EDT).
- **Fall-back overlap** 01:30 → 05:30Z (the first, EDT).
- Seconds accepted; a malformed time and an unknown zone throw.
- The inverse, and a **round trip of every hour of a day in 4 zones** (incl. Asia/Kolkata, +5:30).
- `isValidTimeZone` for real, made-up and empty names.

Gates: `@hr/api` 668/668 (unchanged), `@hr/web` lint + typecheck green — 17/17 turbo tasks.

## Live (local) — HR officer, browser in **Asia/Dubai (UTC+4)**

- Settings → Integrations → Schedule invitation: reference "GCAL04-CHECK", sample participant, 06 Oct 10:00–11:00. The attendee was an `example.com` address, and locally the adapter only captures (nothing goes to Google).
- Zone **"Asia/Atlantis"** → refused with the message; the dialog stays open and nothing is sent.
- Zone **"Asia/Riyadh"** → stored and sent as **`2026-10-06T07:00:00.000Z` (Asia/Riyadh)** = 10:00 in Riyadh. **The old code gave 06:00Z** from this browser.
- The transparency view shows "2026-10-06 10:00 Asia/Riyadh · 2026-10-06T07:00:00.000Z" (end 11:00 · 08:00Z).

Cleanup: the sample invitation row deleted, signed out.

## Not rewritten

Invitations already sent keep their stored times. Any scheduled before this fix from a browser outside Riyadh time could be off by the zone difference. None exist outside test data; noted rather than rewritten.
