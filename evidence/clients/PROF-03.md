# PROF-03 — The Nitaqat panel, the portfolio band column and the Reports band — Evidence

- Date: 2026-10-10
- Status: **done**
- Decision: ADR-019. Card approved in advance ("approved for all 6"). No API change.

## What changed

| Area | Change |
|---|---|
| Client record → Overview, **Nitaqat position** | The stored band as a pill beside the title; the prototype's note for that band (red, yellow, or the shared "without restriction" note); "As shown on Qiwa · checked {date} · {Hijri}"; the Saudi-share bar coloured by the band; **Next band up** and **Band below** from the ladder ("Already at the top band" / "Nothing below this band" at the ends). With no band on file the panel says so and names where an administrator adds it. |
| A line under the bar | "The share counts Saudis on the register by nationality. Nitaqat weights some people differently, so it is not the official figure." It stays whether or not a band is recorded. |
| Overview → client portfolio | The band column shows the stored band, or "Band not recorded". The same table serves the client manager's Overview, where the row is their own company (from the portal's company view). The footnote now says the band is the one recorded from Qiwa. |
| Reports → Saudisation by client | The band beside each company in a fixed-width slot; the bar coloured by the band. The sub-heading no longer says the band is coming soon. |

Nothing is calculated. `bandAbove` / `bandBelow` only step along the fixed ladder.

## Live (dev servers restarted)

Three sample companies were given a band by SQL for the check (the seed gives every company a profile in PROF-05): Alpha yellow, Beta red, Najd platinum; Gulf Medical none.

| Check | Result |
|---|---|
| Beta (red), record Overview, HR officer, 375px | "Nitaqat position · Red · Work permits and transfers are blocked while the band is red. Every hire must be Saudi until it clears. · As shown on Qiwa · checked 30 Sept 2026 · Rabiʻ II 19, 1448 AH". Bar `bg-status-critical`, `rgb(220, 38, 38)`, 44% wide. Next band up: Yellow. Band below: "Nothing below this band". Panel 343px, 0px overflow. |
| Najd (platinum) | "The band supports permits, renewals and transfers without restriction." Next band up: "Already at the top band". Band below: High green. |
| Gulf Medical (none), Arabic | «النطاق غير مسجّل» and «لا يوجد نطاق مسجّل لهذه الشركة…»; both ladder fields «غير مسجّل». 0px overflow. |
| Overview portfolio, HR officer | Alpha Yellow, Beta Red, Gulf Medical "Band not recorded", Najd Platinum. 0px page overflow at 375px. |
| Client manager of Alpha, Arabic (portal switched on for the check) | One row, their own company: «أصفر». No link to a client record. |
| Reports, Administrator, 1280px | Bars: Gulf Medical ink, Alpha amber, Najd ink, Beta red. All four tracks start at x 454 and are 166px wide, so they line up. |

**Changed after that last check, not yet seen on screen:** "Band not recorded" wrapped onto two lines in its 96px slot, so the slot is now 124px and does not wrap; and the Reports sub-heading text. Both are re-checked in the next card's Administrator session, and that result is recorded there.

## Gates

- Web `typecheck` and `lint` clean; `next build` succeeds (dev server stopped; built before the two small changes above, after which `typecheck` and `lint` were re-run).
- No API change: API suite stands at 750/750.

## Data

- The Administrator seed account's temporary authenticator enrolment was cleared (0 enrolled).
- The portal switch for Alpha was removed again.
- The three temporary bands remain on the dev database; PROF-05's seed replaces them.
