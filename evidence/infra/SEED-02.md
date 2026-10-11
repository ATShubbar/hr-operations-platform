# SEED-02 — Re-seeding no longer breaks open sessions — Evidence

- Date: 2026-10-11
- Status: **done**
- Card approved ("approved for all 3").

## The fault

The seed deleted its sample accounts and created them again. Each run gave every account a new id. A browser signed in before the re-seed kept a session carrying the old id: it still worked, but as nobody. Nothing was "assigned to me", and names that should have resolved did not. It looked like a fault in whichever screen was open (NC-06 hit it).

## The fix

`apps/api/prisma/seed-accounts.ts`, `syncSeedAccounts(prisma, accounts, owned)`:

- An account that exists (matched by email) is **updated in place**. Its id does not change.
- Every column the seed owns is written on each run, nulls included: name, role, kind of account, company, employee record, password, status back to active, no authenticator, no "password set by its holder" date. Whatever a walk-through changed is put back.
- A seed-owned account the list no longer names is removed. Any other account is left alone.

`seed.ts` now calls it with the same definition of "seed-owned" as before: the seed's own email domain, and on UAT exactly the seed's addresses at the company domain.

Unchanged: the password is reset to the seed password, and an authenticator enrolled by hand is cleared.

## Tests

`apps/api/test/seed-accounts.e2e-spec.ts` (5), written first.

| Run | Result |
|---|---|
| Against the old behaviour (delete and recreate), kept for one run | **4 failed**, 1 passed (the "removes an unlisted account" case holds either way) |
| After the fix | 5 passed |

Then each remaining rule was broken to see a test fail:

| # | Broken | Failed as expected |
|---|---|---|
| 1 | An unlisted sample account is left behind | yes |
| 2 | The clean-up ignores whose accounts they are | yes |
| 3 | An authenticator enrolled by hand survives | yes |
| 4 | A disabled account stays disabled | yes |

- API suite: **852/852** (847 + 5). Lint and typecheck clean.

## On the real seed (local)

| Check | Result |
|---|---|
| Fingerprint of the ten sample accounts' ids, across two seed runs in a row | identical |
| Signed in as the GRO officer, then re-seeded, then used the **same session** | Before: 30 items, 23 assigned to me. After: 30 items, **23 assigned to me**. `/auth/me` still names the person. Under the old seed this read 0. |
| Each client's named officer after a re-seed | still an existing account, for all four |

## A mistake while proving it

Proof 2 removes the rule that limits the clean-up to the seed's own accounts. Running it did exactly what that rule prevents: **it deleted every account in my local development database.** Nothing outside this machine was touched. I re-ran the seed, which restored the ten sample accounts, and confirmed the references to them. The other local accounts were leftovers from test runs.

The lesson is in the guide: a proof that removes the scope from a delete is destructive wherever it runs. That one should have been argued from the code, or run against a throwaway database.

## Stated plainly

- **On UAT the ids change one last time.** The accounts there were created by the old seed. The first Seed UAT with this change keeps them (it matches by email), so in fact they do not change again at all: the old delete is simply gone. From now on a re-seed needs no fresh sign-in.
- **A session opened before a re-seed keeps the role it had.** If a future seed changed a sample account's role, an open session would carry the old one until sign-in. No seed does that today.
- **Sessions are not ended by the seed.** The fix makes that unnecessary by keeping the ids.
