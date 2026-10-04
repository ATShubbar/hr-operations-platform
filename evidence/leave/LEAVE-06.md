# LEAVE-06 — My leave, nav counts, sample leave for UAT — Evidence

- Date: 2026-10-04
- Card: `BACKLOG.md` → LEAVE-06 (ADR-014). Status: **done** (UAT re-seed by the owner, below). **No API change** apart from the seed and the smoke script.

## What was built

| File | What |
|---|---|
| `(app)/me/leave/page.tsx` | Replaces "coming soon". The prototype's employee view: "My leave", "N requests on file · M awaiting a decision", **Request leave** (always for oneself), **Requests** (every request *about* me, whoever raised it; **Withdraw** on a pending one I raised) and **My balance** (the Person-record card + history over `/me/leave/balance`). When the company's self-service switch is off it shows the same "Not available yet" state as My file. |
| `leaves/leave-detail.tsx` | The detail pane, **extracted** from the Leaves page with an `audience` (staff · client · employee) that picks the wait line. Both screens render it. |
| `leaves/request-leave-dialog.tsx` | `self` mode: no "who" picker, `POST /me/leave`. |
| `employees/[id]/leave-tab.tsx` | Optional `endpoint`, so an employee reads `/me/leave/balance`. |
| `components/nav-counts.tsx`, `app-nav.tsx` | A Leaves badge with what *this* role still has to do: client manager → `pending`, staff → `approved` (awaiting filing), employee → none (as the prototype). Each badge has its own screen-reader label. |
| `prisma/seed.ts` | `seedLeave` and the self-service switch, described below. |
| `scripts/uat-smoke.mjs` | A leave step: HR raises → the client manager approves → **the client manager cannot file (403)** → HR files. |
| messages | `leaves.mine.*`, `leaves.wait.pendingEmployee`, `nav.countLeave`. The dead `states.leavesSoon` / `states.myLeaveSoon` are removed. |

**The seed's leave scenario** (`seedLeave`), placed relative to today. Filed spells write ledger entries **split by year**, as filing does.

- Khalid **away today**;
- Fatimah approved and Abdullah pending on **overlapping dates** (the clash note);
- **the employee account's own** pending request (self-raised);
- Noura **overdrawn** (25 days against ~18);
- pending sick leave;
- a declined and a withdrawn request;
- a company-B request;
- **carry-over credits** (6 and 10);
- one spell **from last year**.

It replaces exactly the seeded people's leave on every run. **`flag.employee-self-service` is turned on for company A**, so the seeded employee can use My file / My leave on UAT. Every e2e suite makes its own companies (checked).

## Verified

Local, after a seed run: **12 leave requests**, in every status. The ledger: 4 filed spells / 45 days this year, 1 / 15 days last year, 2 carry-over credits / 16 days. The switch is `true` for company A.

| Check | Database | Screen |
|---|---|---|
| Client manager (Alpha) badge | 3 pending at Alpha | **3** · "3 leave requests waiting on you" |
| HR badge | 1 approved | **1** · "1 leave request waiting on you" |
| HR tiles | — | Away today **Khalid Almutairi**; Awaiting the employer **4** (3 Alpha + 1 Beta); Awaiting filing **1** |
| Employee (Ahmed) My leave | 2 requests (1 self-raised pending, 1 filed) | "2 requests on file · 1 awaiting a decision"; wait line "With the employer for a decision."; **Withdraw** shown; "15 of 18 days available" (18 − 3 filed) |

**Real clicks, as the employee:**

- **Withdraw** → toast "LV-0413 withdrawn." → status Withdrawn, "0 awaiting a decision".
- **Request leave** → the dialog has **no "who" field**, and the note reads "15 days available · 10 left if this is approved" → Submit → toast "LV-0424 submitted · with your employer for a decision." → selected, "3 requests on file · 1 awaiting".
- **My balance:** 15 available, 3 taken, accrued 18, "Nothing carried from 2025", "5 days awaiting a decision, not yet deducted", history `LV-0414 · 3 days · 5–7 Aug 2026 · Paid · Taken`.

**Arabic at 375px:** both tabs at 0px overflow, no missing keys ("3 طلبات في الملف · 1 بانتظار القرار").

**Smoke check (local):** the new leave step passes all 5 checks.

**API suite: 580/580, twice**, run on a seeded database (CI seeds before testing). The local seed was restored afterwards: the suite's configuration test clears every client setting, and a re-seed puts the switch back.

## On UAT (the owner runs it once this deploys)

GitHub → Actions → **Seed UAT** → `seed-and-smoke`. That loads the leave scenario and turns on self-service for company A. The smoke check then also runs the leave step.
