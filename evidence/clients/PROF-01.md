# PROF-01 — The client profile: data and API — Evidence

- Date: 2026-10-10
- Status: **done**
- Decision: ADR-019. Card approved in advance by the owner ("approved for all 6").

## What changed

| Area | Change |
|---|---|
| Database | Migration `20261011120000_client_profile`: twenty optional columns on `cli_clients` (CR number, city, sector, Nitaqat band + checked-on date, Qiwa/GOSI establishment, VAT, main contact ×5, signatories as a JSON list, portals as a text list, officer id, tier, response commitment, term start/end) and three enums (`NitaqatBand`, `ServiceTier`, `ResponseCommitment`). A unique index on the CR number. Five CHECKs: CR is 10 digits, VAT is 15, a band and its date are both present or both absent, the term cannot end before it starts, signatories is a list. Grants and row-level security are unchanged. |
| Contracts | New `client-profile.ts` (no zod; subpath `@hr/contracts/client-profile`): the fixed lists (9 cities, 9 sectors, the 6-band ladder worst first, 6 portals, 3 tiers, 3 commitments), `bandAbove` / `bandBelow`, `MAX_SIGNATORIES = 10`. `client-company.ts`: strict create and update schemas carrying the profile, and the response shape. |
| Clients module | `domain/client-view.ts`: the one mapping from a row to a response (`toClientResponse(row, officers, audience)`) and the audit snapshot. `ClientsService`: create and update write the profile; rules that need the stored row or another module live here (see below). |
| Auth | `UsersService.staffIdentities(ids)`: a staff account's display name and role, nothing else. |
| Portal | `GET /portal/company` returns the same profile through the same mapping, with audience `client`. |

**Rules in the service** (the contract checks shapes; these need more):
- the band's checked-on date is not in the future (one day of slack, because a date has no zone and Riyadh's day starts three hours before UTC's);
- the term cannot end before it starts, checked against the **stored** other end on a partial change;
- the named officer is an active staff account whose role holds `gro.process` (the ASSIGN-01 rule);
- a second client with the same CR number is a 409, taken from the unique index, not a check-then-write.

**No route was added.** The existing `GET/POST /clients`, `GET/PATCH/DELETE /clients/:id` and `GET /portal/company` carry the profile, so the isolation registry and the audited-writes list are unchanged.

## Tests

`test/client-profile.e2e-spec.ts`, 10 tests, written first. First run: **8 failed, 2 passed** (the two that passed assert refusals that already held: an employee is refused, and the database CHECKs, which the migration had just added).

- An empty profile answers every field as null or an empty list; the response's keys are pinned exactly, at the top and in each group.
- An Administrator records a whole profile; it reads back from `GET /clients/:id` and from the list; the audit entry's before and after carry the profile.
- A partial change touches only what it names; `null` clears; clearing the band clears its date in the database.
- 24 invalid bodies each get 400 and the client is unchanged afterwards. They include a band without its date, a future date, `2026-02-30`, an eleventh signatory, a repeated or unknown portal, a term ending before its stored start, an unknown field, a money field, and **a portal entry carrying a password**.
- The named officer: an Auditor, a client manager and an unknown id are refused; an HR officer is accepted; null clears.
- A second client with the same CR number is 409 on update and on create, and nothing is written.
- HR officer, GRO officer and Auditor read the profile and get 403 on a change.
- A client manager reads their own company's profile through the portal: same top-level keys, the officer as name and role, `officerUserId` null, and the officer's account id nowhere in the body. The other company's manager gets their own company. With the portal switch off: 403.
- An employee gets 403 on all three reads.
- The database refuses five malformed rows written directly.

**Red proofs** (each rule disabled, the spec fails, the file restored and compared byte for byte):

| Disabled | Failed |
|---|---|
| The portal view keeps the officer's account id | 1 |
| The officer rule | 1 |
| The future-date rule | 2 (the second because the red state then held a wrong band) |
| The term checked against the request only | 1 |
| The 409 mapping | 1 |
| The profile left out of the audit snapshot | 1 |

**Gates:** full API suite **750/750, twice** (740 + 10). API `typecheck` and `lint` clean; contracts 11/11; web `typecheck` clean against the wider response type.

## Not in this card

- No screen shows or edits the profile yet (PROF-02 onward), so there was nothing to check in the browser.
- The seeded companies have no profile until PROF-05.
- The band has no effect yet (PROF-06).
