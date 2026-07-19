import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { ScopedPrismaService } from '../src/prisma/scoped-prisma.service';

// SPIKE-001 scenarios 1-8 ported against the PRODUCTION wiring (WS-13).
// The spike validated the pattern; this suite keeps the port honest.

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const CLIENT_B = '22222222-2222-4222-8222-222222222222';

describe('Production RLS pattern (e2e)', () => {
  let app: INestApplication;
  let staff: PrismaService;
  let scoped: ScopedPrismaService;
  let bRowId = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    staff = app.get(PrismaService);
    scoped = app.get(ScopedPrismaService);

    await staff.coreScopeCheck.deleteMany();
    await staff.coreScopeCheck.createMany({
      data: [
        { clientId: CLIENT_A, note: 'A-1' },
        { clientId: CLIENT_A, note: 'A-2' },
        { clientId: CLIENT_B, note: 'B-1' },
      ],
    });
    const bRow = await staff.coreScopeCheck.findFirst({ where: { clientId: CLIENT_B } });
    bRowId = bRow?.id ?? 0;
  });

  afterAll(async () => {
    await staff.coreScopeCheck.deleteMany();
    await app.close();
  });

  it('1. client-A rep reads own rows', async () => {
    const rows = await scoped.forClient(CLIENT_A).coreScopeCheck.findMany({
      where: { clientId: CLIENT_A },
    });
    expect(rows).toHaveLength(2);
  });

  it('2. omitted client filter still returns ONLY own rows', async () => {
    const rows = await scoped.forClient(CLIENT_A).coreScopeCheck.findMany();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.clientId === CLIENT_A)).toBe(true);
  });

  it("3. querying client B's row by ID returns nothing", async () => {
    const row = await scoped.forClient(CLIENT_A).coreScopeCheck.findUnique({
      where: { id: bRowId },
    });
    expect(row).toBeNull();
  });

  it('4. insert with client_id = B is rejected by WITH CHECK', async () => {
    await expect(
      scoped.forClient(CLIENT_A).coreScopeCheck.create({
        data: { clientId: CLIENT_B, note: 'smuggled' },
      }),
    ).rejects.toThrow(/row-level security|denied/i);
  });

  it('4b. update cannot move a row to another client', async () => {
    const own = await scoped.forClient(CLIENT_A).coreScopeCheck.findFirst();
    await expect(
      scoped.forClient(CLIENT_A).coreScopeCheck.update({
        where: { id: own?.id ?? 0 },
        data: { clientId: CLIENT_B },
      }),
    ).rejects.toThrow(/row-level security|denied|No record was found/i);
  });

  it('5. UNSET scope sees zero rows — fail closed', async () => {
    const unscoped = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.CLIENT_DATABASE_URL ?? '' }),
    });
    try {
      const rows = await unscoped.coreScopeCheck.findMany();
      expect(rows).toHaveLength(0);
      const one = await unscoped.coreScopeCheck.findUnique({ where: { id: bRowId } });
      expect(one).toBeNull();
    } finally {
      await unscoped.$disconnect();
    }
  });

  it('6. staff path reads across clients', async () => {
    const rows = await staff.coreScopeCheck.findMany();
    expect(rows).toHaveLength(3);
  });

  it('7. interleaved A/B under concurrency never bleeds scope', async () => {
    const asA = scoped.forClient(CLIENT_A);
    const asB = scoped.forClient(CLIENT_B);
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        (i % 2 === 0 ? asA : asB).coreScopeCheck
          .findMany()
          .then((rows) => ({ expected: i % 2 === 0 ? CLIENT_A : CLIENT_B, rows })),
      ),
    );
    for (const { expected, rows } of results) {
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.clientId === expected)).toBe(true);
    }
  });

  it('8. rolled-back transaction leaves no residual scope', async () => {
    const solo = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.CLIENT_DATABASE_URL ?? '',
        max: 1,
      }),
    });
    try {
      await expect(
        solo.$transaction([
          solo.$executeRaw`SELECT set_config('app.client_id', ${CLIENT_A}, TRUE)`,
          solo.$executeRaw`SELECT 1/0`,
        ]),
      ).rejects.toThrow();
      const rows = await solo.coreScopeCheck.findMany();
      expect(rows).toHaveLength(0);
    } finally {
      await solo.$disconnect();
    }
  });
});
