import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../src/generated/prisma/client';
import {
  CLIENT_ROLES,
  PasswordService,
  STAFF_ROLES,
  type ClientRole,
} from '../src/modules/auth/public-api';

// Development seed (WS-19, extended for AUTH-07). Deterministic and
// idempotent: running it twice yields the same state. The well-known IDs and
// role users below are the contract shared with the isolation harness and
// auth fixtures.

export const SEED_CLIENT_A = '11111111-1111-4111-8111-111111111111';
export const SEED_CLIENT_B = '22222222-2222-4222-8222-222222222222';

// Seeded principals live under this domain so cleanup is a single deleteMany
// scoped by email — never colliding with the `e2e-helper-` users the harness
// creates and cleans on its own.
export const SEED_USER_DOMAIN = 'seed.hr.local';

// One shared dev password across seed users. The seed is production-guarded
// (below), so these credentials never exist outside development.
const SEED_PASSWORD = 'Seed-dev-password-1';

// One client-rep per seeded client, chosen to cover BOTH client roles across
// the two clients (client A → admin, client B → user).
const CLIENT_REP_ASSIGNMENTS: ReadonlyArray<{ clientId: string; role: ClientRole }> = [
  { clientId: SEED_CLIENT_A, role: 'client_admin' },
  { clientId: SEED_CLIENT_B, role: 'client_user' },
];

const clientLetter = (clientId: string): string =>
  clientId === SEED_CLIENT_A ? 'a' : 'b';

async function seedUsers(prisma: PrismaClient): Promise<number> {
  const passwords = new PasswordService();

  // One staff user per role (all seven staff roles) + one client-rep per
  // seeded client. Admin roles (system_admin/company_admin) are seeded WITHOUT
  // an mfa_secret — they log in to an enroll-required session until they
  // enroll, exactly as AUTH-06 requires; the seed never fakes enrollment.
  const staffUsers: Prisma.AuthUserCreateManyInput[] = await Promise.all(
    STAFF_ROLES.map(async (role) => ({
      email: `staff-${role}@${SEED_USER_DOMAIN}`,
      passwordHash: await passwords.hash(SEED_PASSWORD),
      principalType: 'staff' as const,
      role,
    })),
  );

  const clientRepUsers: Prisma.AuthUserCreateManyInput[] = await Promise.all(
    CLIENT_REP_ASSIGNMENTS.map(async ({ clientId, role }) => ({
      email: `${role}-${clientLetter(clientId)}@${SEED_USER_DOMAIN}`,
      passwordHash: await passwords.hash(SEED_PASSWORD),
      principalType: 'client_rep' as const,
      role,
      clientId,
    })),
  );

  const data = [...staffUsers, ...clientRepUsers];

  // Idempotency: replace exactly the seed-owned users (by email domain),
  // leaving any test- or manually-created users untouched.
  await prisma.authUser.deleteMany({
    where: { email: { endsWith: `@${SEED_USER_DOMAIN}` } },
  });
  await prisma.authUser.createMany({ data });

  return data.length;
}

// CLIENT-01: the two seed client companies. Their ids are the well-known
// SEED_CLIENT_A/B used everywhere (client-rep users, scope-check rows), so the
// registry and everything referencing a client_id stay consistent. Upsert by
// id keeps it idempotent without disturbing manually-created clients.
async function seedClients(prisma: PrismaClient): Promise<number> {
  const clients = [
    { id: SEED_CLIENT_A, nameAr: 'شركة الألف التجارية', nameEn: 'Alpha Trading Co.' },
    { id: SEED_CLIENT_B, nameAr: 'مؤسسة الباء للمقاولات', nameEn: 'Beta Contracting Est.' },
  ];
  for (const c of clients) {
    await prisma.client.upsert({
      where: { id: c.id },
      create: { id: c.id, nameAr: c.nameAr, nameEn: c.nameEn, status: 'active' },
      update: { nameAr: c.nameAr, nameEn: c.nameEn },
    });
  }
  return clients.length;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed: NODE_ENV=production. The seed is development-only.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg(process.env.DATABASE_URL ?? ''),
  });

  try {
    // Client companies first — they originate the client_ids everything else
    // references (no FK across modules, so order is for clarity, not integrity).
    const clientCount = await seedClients(prisma);

    const fixtures = [
      { clientId: SEED_CLIENT_A, note: 'seed:client-a:sample-1' },
      { clientId: SEED_CLIENT_A, note: 'seed:client-a:sample-2' },
      { clientId: SEED_CLIENT_B, note: 'seed:client-b:sample-1' },
    ];

    // Idempotency: replace exactly the seed-owned rows (note prefix "seed:"),
    // never touching data created by tests or manual use.
    await prisma.coreScopeCheck.deleteMany({ where: { note: { startsWith: 'seed:' } } });
    await prisma.coreScopeCheck.createMany({ data: fixtures });

    const userCount = await seedUsers(prisma);

    const rowCount = await prisma.coreScopeCheck.count({
      where: { note: { startsWith: 'seed:' } },
    });
    const roleCount = STAFF_ROLES.length + CLIENT_REP_ASSIGNMENTS.length;
    process.stdout.write(
      `Seed complete: ${clientCount} client companies; ${rowCount} scope-check rows ` +
        `across clients A (${SEED_CLIENT_A}) and B (${SEED_CLIENT_B}); ${userCount} auth users ` +
        `(${STAFF_ROLES.length} staff roles + ${CLIENT_REP_ASSIGNMENTS.length} client reps, ` +
        `${roleCount}/${STAFF_ROLES.length + CLIENT_ROLES.length} distinct roles covered).\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
