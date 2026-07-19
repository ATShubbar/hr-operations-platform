import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

// Development seed (WS-19). Deterministic and idempotent: running it twice
// yields the same state. Extend this file as Priority-2 tables land
// (clients, users per role) — the well-known IDs below are the contract
// shared with the isolation harness and future auth fixtures.

export const SEED_CLIENT_A = '11111111-1111-4111-8111-111111111111';
export const SEED_CLIENT_B = '22222222-2222-4222-8222-222222222222';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed: NODE_ENV=production. The seed is development-only.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg(process.env.DATABASE_URL ?? ''),
  });

  try {
    const fixtures = [
      { clientId: SEED_CLIENT_A, note: 'seed:client-a:sample-1' },
      { clientId: SEED_CLIENT_A, note: 'seed:client-a:sample-2' },
      { clientId: SEED_CLIENT_B, note: 'seed:client-b:sample-1' },
    ];

    // Idempotency: replace exactly the seed-owned rows (note prefix "seed:"),
    // never touching data created by tests or manual use.
    await prisma.coreScopeCheck.deleteMany({ where: { note: { startsWith: 'seed:' } } });
    await prisma.coreScopeCheck.createMany({ data: fixtures });

    const count = await prisma.coreScopeCheck.count({
      where: { note: { startsWith: 'seed:' } },
    });
    process.stdout.write(
      `Seed complete: ${count} seed rows across clients A (${SEED_CLIENT_A}) and B (${SEED_CLIENT_B}).\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
