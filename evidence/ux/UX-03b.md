# UX-03b — Bidi isolation of Latin identifiers and dual-calendar dates — Evidence

- Date: 2026-10-11
- Status: **closed — overtaken by later work.** No code change in this card.

## Why it is closed

The card (2026-07) asked for Latin identifiers and dual-calendar dates to be wrapped in `<bdi>`
so they survive a right-to-left page. Two things happened since:

1. **ADR-012** made the layout left to right in both languages, so the fault the card describes
   (identifiers reordering inside a right-to-left page) cannot occur.
2. The pieces that still mattered were done by other cards:
   - UX-08: identifier INPUTS can be marked left-to-right, and read-only identifiers render in
     `<bdi dir="ltr">`.
   - DS-06 onwards: the Person record and the queue isolate their codes.
   - UX-18: Arabic messages that open with a number.

## Checked (local, Arabic, 2026-10-11)

| Screen | Found |
|---|---|
| Person record → Profile | 8 values inside `<bdi dir="ltr">` — iqama number `2000002000`, work permit `WP-000002`, policy `POL-0001-000002`, licence `DL-0001-000002` and the rest |
| Work queue | 14 reference codes inside `<bdi dir="ltr">` |
| Dual-calendar dates | Hijri lines come from `Intl` as one formatted string and sit on their own line or after a `·`; none reordered |

What remains of bidi work is UX-20 (a trailing full stop; a Latin name inside an Arabic
sentence), filed from UX-18.
