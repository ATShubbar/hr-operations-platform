# PROF-00 — The client profile and the Nitaqat band into the architecture (ADR-019, architecture.md v1.13) — Evidence

- Date: 2026-10-10
- Status: **done**. Documentation only: no code, nothing deployed.

## Owner decisions (asked; answers recorded)

| Question | Answer |
|---|---|
| Which epic next? | **"let's do client profile + Nitaqat band next"** |
| Who may change a client's profile? | **Administrator only** (recommended). The matrix stays as it is. |
| What does a client manager see of their own company's profile? | **All of it, read-only** (recommended). |
| Which Service-panel fields come in now? | **All four, as recorded facts** (recommended): named officer, tier, response commitment, term start/end. No behaviour; money waits for Billing. |
| Should a Red or Yellow band change what the app lets staff do? | **Warn at the moment.** (I recommended "information only"; the owner chose warnings.) |
| The PROF-00 card, the precise warning rule, and the six build cards | **"approved for all 6"** |

## What the research found first

- **Prototype** (`design/…/People & Gro Console.dc.html`):
  - `CLIENTS` rows carry `cr`, `band`, `city`, `sector`, `tier`, `sla`, `gro` (named officer), `gosi`, `qiwaEst`, `vat`, `contact {name, ar, role, email, phone}`, `signatories[]`, `portals[]`, `start`, `end`, plus money fields (`platform`, `seat`, `cycle`, `po`, `terms`, `pay`, `outstanding`).
  - **The band is stored.** `acForm` (Add client) has a "Nitaqat band" select defaulting to "Medium green"; nothing computes it. `BAND_LADDER = Red, Yellow, Low green, Medium green, High green, Platinum`.
  - The band's only effect is a note (`bandNote`): Red "Work permits and transfers are blocked while the band is red. Every hire must be Saudi until it clears."; Yellow "Renewals still pass, but new permits are restricted. One Saudi hire moves this to green."; otherwise "supports permits, renewals and transfers without restriction". Nothing is blocked in the prototype.
  - Add client is administrator-only (`canAddClient: this.role === 'admin'`). City and sector are selects of nine options each.
  - The record's Overview has "Nitaqat position" (note, Saudi share, next band up, band below) and "Service" (named officer, tier, response commitment, term ends). The Records tab has main contact, authorised signatories, registrations and "Portals we hold credentials for", then fee figures. The Commercial tab is administrator-only and is all money.
- **App today:**
  - `cli_clients` holds `name_ar`, `name_en`, `status` and timestamps. The contract (`client-company.ts`) matches.
  - Matrix row "Client companies": Administrator CRUD, HR/GRO/Auditor R, client manager R (own), employee none.
  - Placeholders this epic fills: `clients.profileLineSoon`, `clients.profileSoon`, `nitaqatSoon`, the Service panel, the Records tab's profile content, the portfolio band column, `reports.dash.bandSoon`.
  - GRO procedure types include `work_permit_renewal` and `sponsorship_transfer`, which the Red warning names.

## What was written

| File | Change |
|---|---|
| `adr/ADR-019-client-profile.md` | New. Context, options, the decision (fields, who, the warning rule, audit, out of scope), consequences, build cards. |
| `adr/README.md` | ADR-019 in the index. |
| `architecture.md` | **v1.13**: changelog entry; the Clients module line names the profile. The matrix is unchanged. |
| `BACKLOG.md` | PROF-00 done; PROF-01..06 listed as approved. |
| `CLAUDE.md` | Map row (v1.13, ADR-019) and a current-state paragraph. |

## Choices of mine inside the decision (stated in the ADR, open to change)

- **A "last checked" date is required with a band.** The prototype has no such date. A stored band goes stale, and the warning needs to say how old it is.
- **Every new field is optional**, because the five existing clients predate them.
- **Signatories are a list on the client's row**, not their own table. Their history is the audit trail's before/after.
- **The client manager's profile comes through the portal's company view**, so it follows the portal switch.
- **Portals are names only**: the app never stores a portal credential.
- **Yellow warns on hiring moves only.** The app has no "new work permit" procedure type, and the prototype says renewals still pass on Yellow.

## Not verified here

The ADR does not describe how Nitaqat is officially calculated or how often Qiwa recalculates it. Nothing in this epic depends on either, and neither was checked.
