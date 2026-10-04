# ADR-015 — Global search: one permission-aware read across modules, identifier lookups audited

- Status: Accepted
- Date: 2026-10-04
- Owner: Ahmed Alshubbar (product decision; SEARCH-01)
- Amends: **architecture.md** — the business module list (a `Search` delivery module), the
  permission catalog and matrix (`search.read`). Now **v1.9**.

## Context
The prototype's header carries a search box ("Search people, refs, ID numbers") that finds people
by name or government identifier, dependants, work items, clients, fees and requests, and opens
each. The box has been shown disabled ("Soon") since DS-04. Searching by an iqama, national ID,
passport or GOSI number is a lookup of government data — personal data that Saudi PDPL treats as
sensitive — so where the search runs and what it records are decisions, not implementation detail.

## Decision
1. **Server-side, one endpoint**: `GET /search?q=` in a new **delivery** module `modules/search`
   (like Reporting and History): it owns no data, reads other modules through their public APIs,
   and nothing imports it. At least 2 characters; at most 12 results; folded with `@hr/text` —
   the SAME normaliser the web lists use, so the box and the lists agree on what matches.
2. **Permission-aware per source, never wider than the screens**: each kind of result is
   searched only through the caller's own access to it:
   - **People** — staff with `employee.read`; matching on **identifiers only for holders of
     `govdata.read`** (field-level authorization, ADR-002 — a role that cannot see a number cannot
     find someone by it). Client managers: their own employees by name, only while their company's
     client portal is on (`flag.client-self-service`, the My employees rule). Employees: none.
   - **Clients** — `client.read` holders, by name.
   - **Procedures** — `gro.read`, by reference number or the person's name.
   - **Tasks** — `task.read`, own/assigned unless `task.read-all` (the Tasks rule).
   - **Requests** and **Leave** — on the caller's own path (staff cross-client; client manager
     own company via RLS; employee their own via RLS).
3. **A new permission `search.read`**, held by all six roles. It admits a caller to the box; it
   reveals nothing by itself — every result is gated as above.
4. **Identifier lookups are audited** (owner decision). A search that matches anyone ON AN
   IDENTIFIER writes one audit entry — resource `search`, action `identifier-lookup` — recording
   who, when, which kind of identifier, the **last four digits only** and the number of people
   matched. Never the full number (the audit trail must not become a second copy of it). Name
   searches are not audited.
5. **Not searched yet**: dependants and fees (their epics don't exist); client commercial
   registration numbers (not stored). The box says so rather than pretending.

## Consequences
- A 15th business module (delivery layer) and a 22nd permission resource.
- v1 filters in memory over each module's list — fine at today's size; if search becomes slow,
  each owning module adds an indexed search method (search never queries another module's tables).
- An identifier search is an audited READ, joining the report export in `AUDITED_READS`.

## Links
- architecture.md v1.9; ADR-002 (field-level authorization), ADR-011 (self-service), ADR-012
  (prototype fidelity), ADR-014 (leave)
- `design/…/People & Gro Console.dc.html` — `searchHits()`
- `BACKLOG.md` → SEARCH-01; `evidence/search/SEARCH-01.md`
