# SEARCH-01 — Global search — Evidence

- Date: 2026-10-04
- Card: `BACKLOG.md` → SEARCH-01. Decision record: **ADR-015** (architecture.md **v1.9**). Status: **done**.

## Owner decisions

| Question | Answer |
|---|---|
| Audit searches by a government ID number? | **Yes** (recommended). Who, when, which kind of ID, **last four digits only**, how many matched. Name searches aren't audited. |
| What can a client manager search? | **Requests, leave, and their own people** (when their client portal is on, the My employees rule). |

## What was built

| Piece | What |
|---|---|
| ADR-015 + architecture v1.9 | a `Search` delivery module; the `search.read` catalog row and matrix row (every role); the rules below |
| `modules/search` (API) | `GET /search?q=` (2–100 chars, ≤12 hits + `truncated`). Reads Employees, Clients, GRO, Tasks, Requests and Leave through their public APIs, with Arabic folding by `@hr/text` (now an API dependency, so server and lists agree). |
| Who finds what | **Staff:** people by name (any `employee.read`), **by iqama / national ID / border / passport / GOSI / work-permit number only with `govdata.read`**; clients; procedures (reference or person, `gro.read`); tasks (own/assigned unless `task.read-all`); requests; leave (ref or person). **Client manager:** own requests and leave via RLS, own people by name only when the portal is on, **never by identifier**. **Employee:** own requests and leave, only when their company's self-service is on. |
| Audit | an identifier match writes `search` / `identifier-lookup` with `{identifierKinds, last4, matched}`. `GET /search` added to `AUDITED_READS`. |
| Contracts | `search.ts`: one typed hit per kind (person · client · procedure · task · request · leave); the web labels them in each language. |
| `components/global-search.tsx` (web) | Replaces the disabled "Soon" box. A combobox (`aria-expanded` / `aria-controls` / `aria-activedescendant`, ↑ ↓ Enter Escape); 250ms debounce, with a slower old answer never overwriting a newer one; a dropdown with icon, title, subtitle and kind label; the footer gives the count / "none" / "keep typing", plus the **"Dependants and fees aren't searchable yet"** note for staff. Phones get a search icon that opens a full-width bar. Results open the person record (portal record for client managers), the client record, the person's Open work tab (procedures), the queue's task view, the request, or the leave (`/leaves?l=`, `/me/leave?l=`, newly honoured). |

## Tests

`test/search.e2e-spec.ts`: **11/11** (fixtures in their own two companies, with an unusual word so the seed can't match):

- **Staff:**
  - `احمد زفير` finds `أحمد زفير` (Arabic fold), across companies;
  - **an iqama number typed with spaces finds the person, `matchedOn: 'iqama'`**, with **exactly one** audit entry `{identifierKinds: ['iqama'], last4: '4321', matched: 1}` that **does not contain the full number**;
  - a name search is **not** audited;
  - **with `govdata.read` taken away (narrowed PolicyService), the identifier finds nobody and nothing is audited**;
  - clients, a procedure by reference, requests and leave are found;
  - tasks follow the own/assigned rule.
- **Client managers:** their own people (portal on), requests and leave; never the other company; **an identifier finds nothing**. With the portal off, no people.
- **Employees:** their own request and leave; a colleague's leave never; no people.
- **Edges:** under 2 characters → nothing; at most 12; unauthenticated → 401.

**Red proof:** removing the `govdata.read` gate turned "without govdata.read, an identifier finds nobody" red. Restored → 11/11.

Also updated: the SS-01 test pins the employee's exact permissions, so it now includes `search.read` (a deliberate ADR-015 addition: a `self` route, scoped in the service). `role-matrix` has the new row.

**API suite: 591/591, twice.** Web typecheck + lint clean.

## Verified live (local dev, seeded data, real typing)

- **HR, `احمد`** (no hamza) → 7 results: Ahmed Eltayeb, Ahmed Hassan (Person), three of his procedures, two of his leave requests; footer "7 results · Dependants and fees aren't searchable yet."
- **HR, `2000 002 000`** → Ahmed Hassan **"Iqama number · Accountant · Alpha Trading Co."**, plus three people whose seeded numbers contain those digits (matching is "contains"). The audit row reads: actor `staff-hr_officer`, `identifier-lookup`, `{"last4":"2000","matched":4,"identifierKinds":["iqama"]}`, with no full number.
- **Clicking a result** opened `/en/employees/e0000001-…02`, "Ahmed Hassan"; the box cleared and the list closed.
- **Client manager (Alpha), via the API:**
  - "Ahmed" → two requests and two leave requests, **no people**: Alpha's client portal is off in the seed, so this is the rule working;
  - the iqama number → nothing;
  - Beta's "Rajesh" → nothing.
- **Employee:** "Ahmed" → their own two leave requests; a colleague's name ("Fatimah") → nothing.
- **Arabic at 375px:** the search icon opens the full-width bar. `فاطمة` → "فاطمة الزهراني · أخصائية موارد بشرية · شركة الألف التجارية · شخص" and her leave; "نتيجتان"; **0px overflow**.

## Not in this card

- Dependants and fees (their epics), and client commercial registration numbers (not stored).
- The work queue has no per-item link, so a task result opens the queue's task view.
