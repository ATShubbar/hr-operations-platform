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

// EMP-01: a few seed employees across the two clients, spanning the sensitivity
// groups (Saudi with national id + salary; non-Saudi with iqama/work permit/
// expiry; GOSI/WPS status). Fixed ids so upsert stays idempotent.
async function seedEmployees(prisma: PrismaClient): Promise<number> {
  const employees = [
    {
      id: 'e0000001-0000-4000-8000-000000000001',
      clientId: SEED_CLIENT_A,
      nameAr: 'محمد العبدالله',
      nameEn: 'Mohammed Alabdullah',
      nationality: 'SA',
      gender: 'male' as const,
      department: 'Operations',
      jobTitleEn: 'Site Supervisor',
      contractType: 'unlimited' as const,
      employmentStatus: 'active' as const,
      countsTowardSaudization: true,
      nationalId: '1012345678',
      basicSalary: 9000,
      housingAllowance: 2250,
      gosiRegistrationStatus: 'registered' as const,
    },
    {
      id: 'e0000001-0000-4000-8000-000000000002',
      clientId: SEED_CLIENT_A,
      nameAr: 'أحمد حسن',
      nameEn: 'Ahmed Hassan',
      nationality: 'EG',
      gender: 'male' as const,
      department: 'Finance',
      jobTitleEn: 'Accountant',
      contractType: 'fixed_term' as const,
      employmentStatus: 'active' as const,
      countsTowardSaudization: false,
      iqamaNumber: '2456789012',
      workPermitNumber: 'WP-2024-118',
      iqamaExpiry: new Date('2027-03-15'),
      workPermitExpiry: new Date('2027-03-15'),
      exitReentryStatus: 'single' as const,
      basicSalary: 7000,
      gosiRegistrationStatus: 'registered' as const,
      wpsStatus: 'compliant' as const,
    },
    {
      id: 'e0000002-0000-4000-8000-000000000001',
      clientId: SEED_CLIENT_B,
      nameAr: 'راجيش كومار',
      nameEn: 'Rajesh Kumar',
      nationality: 'IN',
      gender: 'male' as const,
      department: 'Maintenance',
      jobTitleEn: 'Electrician',
      contractType: 'unlimited' as const,
      employmentStatus: 'active' as const,
      countsTowardSaudization: false,
      iqamaNumber: '2987654321',
      iqamaExpiry: new Date('2026-11-01'),
      basicSalary: 4500,
      gosiRegistrationStatus: 'pending' as const,
    },
  ];
  for (const { id, ...rest } of employees) {
    await prisma.employee.upsert({ where: { id }, create: { id, ...rest }, update: rest });
  }
  return employees.length;
}

async function seedDocuments(prisma: PrismaClient): Promise<number> {
  // Metadata-only fixtures (the blob layer is exercised by the upload flow,
  // DOC-02+). Each carries a first-class expiryDate so the document-expiry
  // engine (3.4) has data to scan. Linked to the seed employees.
  const AHMED = 'e0000001-0000-4000-8000-000000000002';
  const RAJESH = 'e0000002-0000-4000-8000-000000000001';
  const documents = [
    {
      id: 'd0000001-0000-4000-8000-000000000001',
      clientId: SEED_CLIENT_A,
      employeeId: AHMED,
      category: 'iqama' as const,
      title: 'Iqama — Ahmed Hassan',
      fileName: 'iqama-ahmed.pdf',
      contentType: 'application/pdf',
      status: 'available' as const,
      issueDate: new Date('2024-03-15'),
      expiryDate: new Date('2027-03-15'),
    },
    {
      id: 'd0000001-0000-4000-8000-000000000002',
      clientId: SEED_CLIENT_A,
      employeeId: AHMED,
      category: 'contract' as const,
      title: 'Employment Contract — Ahmed Hassan',
      fileName: 'contract-ahmed.pdf',
      contentType: 'application/pdf',
      status: 'available' as const,
      expiryDate: new Date('2026-12-31'),
    },
    {
      id: 'd0000002-0000-4000-8000-000000000001',
      clientId: SEED_CLIENT_B,
      employeeId: RAJESH,
      category: 'iqama' as const,
      title: 'Iqama — Rajesh Kumar',
      fileName: 'iqama-rajesh.pdf',
      contentType: 'application/pdf',
      status: 'available' as const,
      expiryDate: new Date('2026-11-01'),
    },
  ];
  for (const { id, ...rest } of documents) {
    const storageKey = `clients/${rest.clientId}/documents/${id}/${rest.fileName}`;
    await prisma.document.upsert({
      where: { id },
      create: { id, storageKey, ...rest },
      update: { storageKey, ...rest },
    });
  }
  return documents.length;
}

async function seedRequests(prisma: PrismaClient): Promise<number> {
  // Client-facing workflow requests (REQ-01), attributed to the seeded client
  // reps (client A's admin, client B's user) — the authors clients would be.
  // Runs after seedUsers so the creator ids resolve.
  const repA = await prisma.authUser.findUnique({
    where: { email: `client_admin-a@${SEED_USER_DOMAIN}` },
  });
  const repB = await prisma.authUser.findUnique({
    where: { email: `client_user-b@${SEED_USER_DOMAIN}` },
  });
  if (!repA || !repB) return 0; // reps not seeded → skip

  const requests = [
    {
      id: 'a0000001-0000-4000-8000-000000000001',
      clientId: SEED_CLIENT_A,
      type: 'letter' as const,
      title: 'Salary certificate for Ahmed Hassan',
      description: 'Please issue a salary certificate addressed to the bank.',
      priority: 'normal' as const,
      status: 'open' as const,
      dueDate: new Date('2026-08-05'),
      createdByUserId: repA.id,
    },
    {
      id: 'a0000001-0000-4000-8000-000000000002',
      clientId: SEED_CLIENT_A,
      type: 'gro_service' as const,
      title: 'Iqama renewal — Ahmed Hassan',
      priority: 'high' as const,
      status: 'in_progress' as const,
      dueDate: new Date('2026-08-20'),
      createdByUserId: repA.id,
    },
    {
      id: 'a0000002-0000-4000-8000-000000000001',
      clientId: SEED_CLIENT_B,
      type: 'certificate' as const,
      title: 'Employment letter — Rajesh Kumar',
      priority: 'normal' as const,
      status: 'open' as const,
      createdByUserId: repB.id,
    },
  ];
  for (const { id, ...rest } of requests) {
    await prisma.request.upsert({ where: { id }, create: { id, ...rest }, update: rest });
  }
  return requests.length;
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
    const employeeCount = await seedEmployees(prisma);
    const documentCount = await seedDocuments(prisma);

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
    const requestCount = await seedRequests(prisma);

    const rowCount = await prisma.coreScopeCheck.count({
      where: { note: { startsWith: 'seed:' } },
    });
    const roleCount = STAFF_ROLES.length + CLIENT_REP_ASSIGNMENTS.length;
    process.stdout.write(
      `Seed complete: ${clientCount} client companies; ${employeeCount} employees; ${documentCount} documents; ${requestCount} requests; ${rowCount} scope-check rows ` +
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
