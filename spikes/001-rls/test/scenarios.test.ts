import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CLIENT_A,
  CLIENT_B,
  makeClientBase,
  makeOwnerClient,
  makeStaffClient,
  scoped,
} from '../src/clients.js';

const owner = makeOwnerClient();
const staff = makeStaffClient();
const clientBase = makeClientBase();
const asClientA = scoped(clientBase, CLIENT_A);
const asClientB = scoped(clientBase, CLIENT_B);

let bRowId = 0;

beforeAll(async () => {
  await owner.spEmployee.deleteMany();
  await owner.spEmployee.createMany({
    data: [
      { clientId: CLIENT_A, name: 'A-1', salary: 1000 },
      { clientId: CLIENT_A, name: 'A-2', salary: 2000 },
      { clientId: CLIENT_B, name: 'B-1', salary: 3000 },
    ],
  });
  const bRow = await owner.spEmployee.findFirst({ where: { clientId: CLIENT_B } });
  bRowId = bRow?.id ?? 0;
});

afterAll(async () => {
  await owner.$disconnect();
  await staff.$disconnect();
  await clientBase.$disconnect();
});

describe('SPIKE-001 scenarios', () => {
  it('1. client-A rep reads own rows', async () => {
    const rows = await asClientA.spEmployee.findMany({ where: { clientId: CLIENT_A } });
    expect(rows).toHaveLength(2);
  });

  it('2. omitted client filter still returns ONLY own rows (S1)', async () => {
    const rows = await asClientA.spEmployee.findMany(); // no where clause at all
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.clientId === CLIENT_A)).toBe(true);
  });

  it("3. querying client B's row by ID returns nothing (S1)", async () => {
    const row = await asClientA.spEmployee.findUnique({ where: { id: bRowId } });
    expect(row).toBeNull();
  });

  it('4. insert with client_id = B is rejected by WITH CHECK (S6)', async () => {
    await expect(
      asClientA.spEmployee.create({
        data: { clientId: CLIENT_B, name: 'smuggled', salary: 1 },
      }),
    ).rejects.toThrow(/row-level security|denied/i);
  });

  it("4b. update cannot move a row to another client (S6)", async () => {
    const own = await asClientA.spEmployee.findFirst();
    await expect(
      asClientA.spEmployee.update({
        where: { id: own?.id ?? 0 },
        data: { clientId: CLIENT_B },
      }),
    ).rejects.toThrow(/row-level security|denied|No record was found/i);
  });

  it('5. UNSET scope sees zero rows on every query — fail closed (S2)', async () => {
    const rows = await clientBase.spEmployee.findMany();
    expect(rows).toHaveLength(0);
    const one = await clientBase.spEmployee.findUnique({ where: { id: bRowId } });
    expect(one).toBeNull();
  });

  it('6. staff role reads across clients (RLS not blocking staff path)', async () => {
    const rows = await staff.spEmployee.findMany();
    expect(rows).toHaveLength(3);
  });

  it('7. interleaved A/B on a TINY pool (max=2) never bleeds scope (S3-mini)', async () => {
    const tinyBase = makeClientBase(2);
    const tinyA = scoped(tinyBase, CLIENT_A);
    const tinyB = scoped(tinyBase, CLIENT_B);
    try {
      const tasks = Array.from({ length: 40 }, (_, i) =>
        i % 2 === 0
          ? tinyA.spEmployee.findMany().then((rows) => ({ expected: CLIENT_A, rows }))
          : tinyB.spEmployee.findMany().then((rows) => ({ expected: CLIENT_B, rows })),
      );
      const results = await Promise.all(tasks);
      for (const { expected, rows } of results) {
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((r) => r.clientId === expected)).toBe(true);
      }
    } finally {
      await tinyBase.$disconnect();
    }
  });

  it('8. rolled-back transaction leaves NO residual scope on the connection (S3)', async () => {
    const soloBase = makeClientBase(1); // one connection: guaranteed reuse
    try {
      await expect(
        soloBase.$transaction([
          soloBase.$executeRaw`SELECT set_config('app.client_id', ${CLIENT_A}, TRUE)`,
          soloBase.$executeRaw`SELECT 1/0`, // force rollback mid-transaction
        ]),
      ).rejects.toThrow();
      // Same (only) connection, next request, no scope set -> must be 0 rows.
      const rows = await soloBase.spEmployee.findMany();
      expect(rows).toHaveLength(0);
    } finally {
      await soloBase.$disconnect();
    }
  });

  it('9. pool starvation behaves as queueing, not corruption (documented)', async () => {
    const tinyStaff = makeStaffClient(2);
    try {
      const started = Date.now();
      await Promise.all(
        Array.from({ length: 6 }, () => tinyStaff.$queryRaw`SELECT pg_sleep(0.3)::text AS slept`),
      );
      const elapsed = Date.now() - started;
      // 6 sleeps of 300ms on 2 connections => ~3 waves => >= 900ms wall time.
      expect(elapsed).toBeGreaterThanOrEqual(850);
      // eslint-disable-next-line no-console
      console.log(`scenario 9: 6x300ms sleeps on pool(max=2) took ${elapsed}ms (queued cleanly)`);
    } finally {
      await tinyStaff.$disconnect();
    }
  });
});
