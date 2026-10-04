# REQ-06 — A client manager's own company shown as an id fragment — Evidence

- Date: 2026-10-04
- Card: `BACKLOG.md` → REQ-06 (found in THREAD-03). Status: **done**.

## Owner decision

| Question | Answer |
|---|---|
| What should a client manager see where staff see the company name? | **Nothing** (recommended). Every request they can see is their own company's, so the name only repeats itself. Screen-only fix, no API change. |

## Cause

`requests/page.tsx` named companies from `/clients` and assignees from `/staff-users/directory`. Both are **staff-only** lists, so a client manager got a 403 for each, and the page fell back to the first 8 characters of the id.

## Measured first

A scan of every screen a client manager opens (each loaded in a 1280px iframe, `main` text matched against `\b[0-9a-f]{8}\b`):
- **Requests** showed `11111111`: the detail line "Letter · Abdulaziz Al-Ghamdi · Client · 11111111", plus the list's search text.
- Overview, Leaves, Hiring, Calendar and the portal screens showed **none**.

**A second leak the card hadn't named.** No seeded client-A request is assigned, so the first scan couldn't see it. With one temporarily assigned, the client manager saw **"Assigned to fc335883 · — · now in the work queue"** and an **"Open work queue"** button to a staff-only screen. It falls under the card's "no id fragment anywhere on Requests", so it's fixed here. The staff directory is deliberately staff-only (UX-10b), so the client manager is told *that* the team has it, not *who*.

## What changed (`apps/web/src/app/[locale]/(app)/requests/page.tsx` + messages)

- `clientName()` returns null for anyone but staff, so the company is left out of the detail line and the list search. The detail line is now built from its parts and joined, which also drops the stray " · " a deleted requester used to leave.
- The page **no longer asks for `/clients` or `/staff-users/directory` unless the viewer is staff**: two fewer 403s per visit.
- For a client manager, an assigned request shows **"Being handled by PEOPLE&GRO — The team has it in hand. Updates and questions appear on this page."** (ar: «قيد المعالجة لدى PEOPLE&GRO — …»), with no name and no button. Staff keep "Assigned to <name> · <role>".
- **Pre-existing slip fixed in the same block:** for staff, "Open work queue" went to `/tasks`, which has been *Task history* since DS-13. It now goes to `/queue`.

## Verified (local, browser)

**Client manager A** (the same iframe scan):

| Route | id fragments | calls to staff-only lists | assigned block |
|---|---|---|---|
| `/en/requests` | 0 (was `11111111`) | **0** | — |
| `/en/requests?r=…002` (assigned) | 0 (was `11111111`, `fc335883`) | 0 | "Being handled by PEOPLE&GRO" |
| `/ar/requests?r=…002` | 0 | 0 | «قيد المعالجة لدى PEOPLE&GRO» |
| `/en/overview`, `/en/leaves` | 0 | 0 | — |

**Arabic at 375px:** the detail line reads «خدمة حكومية · Abdulaziz Al-Ghamdi · العميل», with 0 fragments and 0px overflow.

**HR officer:**
- The detail line still names the company ("GRO service · Abdulaziz Al-Ghamdi · Client · Alpha Trading Co.").
- The assigned block reads "Assigned to Omar Al-Shehri · HR officer".
- "Open work queue" lands on `/en/queue`.

Web typecheck + lint green. No API change.

**Found, not fixed (no visible effect):** as a client manager, `/calendar` and `/hiring` still *request* staff-only lists (4 and 2 calls, each answered 403). Nothing renders from them: Calendar isn't theirs to use, and Hiring shows their own roles. It's noise in the network log, not on screen.

**Cleanup:** the temporary assignment reverted, signed out.
