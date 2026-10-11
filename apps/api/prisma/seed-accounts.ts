import type { Prisma, PrismaClient } from '../src/generated/prisma/client';

// The sample ACCOUNTS (SEED-02). Split out of seed.ts so it can be tested
// without running the whole seed.
//
// The seed used to delete its accounts and create them again. Every run
// therefore gave each account a NEW id, and a browser signed in before the
// re-seed kept a session carrying the old one: it still worked, but as nobody
// — nothing was "assigned to me", and names that should have resolved did not.
// It looked like a fault in whichever screen was open.
//
// The accounts are now kept IN PLACE, matched by email:
//   · one that exists is updated — and EVERY column the seed owns is written,
//     nulls included, so whatever a walk-through changed (a name, a role, a
//     disabled status, an authenticator enrolled by hand) is put back;
//   · one that is missing is created;
//   · a seed-owned account the list no longer names is removed.
// `owned` says which accounts are the seed's to touch: anyone else is left alone.

export interface SeedAccount {
  email: string;
  passwordHash: string;
  principalType: 'staff' | 'client_rep' | 'employee';
  role: Prisma.AuthUserCreateManyInput['role'];
  displayName: string;
  /** A client manager's company. */
  clientId?: string;
  /** The record an employee account is. */
  employeeId?: string;
}

export async function syncSeedAccounts(
  prisma: PrismaClient,
  accounts: readonly SeedAccount[],
  owned: Prisma.AuthUserWhereInput,
): Promise<void> {
  await prisma.authUser.deleteMany({
    where: { AND: [owned, { email: { notIn: accounts.map((a) => a.email) } }] },
  });
  for (const a of accounts) {
    const fields = {
      passwordHash: a.passwordHash,
      principalType: a.principalType,
      role: a.role,
      displayName: a.displayName,
      clientId: a.clientId ?? null,
      employeeId: a.employeeId ?? null,
      status: 'active' as const,
      // As a freshly created account: no password "set by its holder" (it is
      // the seed's), and no authenticator — the seed never fakes an enrolment,
      // and one made by hand during a walk-through is cleared.
      passwordSetAt: null,
      mfaSecret: null,
    };
    await prisma.authUser.upsert({
      where: { email: a.email },
      create: { email: a.email, ...fields },
      update: fields,
    });
  }
}
