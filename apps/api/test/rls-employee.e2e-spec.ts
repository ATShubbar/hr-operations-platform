import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { EmployeeScopedPrismaService } from '../src/prisma/employee-scoped-prisma.service';

// SS-02 (ADR-011): the database backstop for employee self-service. An
// app_employee session sees ONE employee's row and documents — not a colleague
// at the same company, not anyone at another company, nothing when unscoped —
// and can write nothing and read no other table.
//
// Fixtures are created here (owner connection, bypasses RLS) rather than read
// from the seed, so the assertions don't move when the seed does.

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const CLIENT_B = '22222222-2222-4222-8222-222222222222';
const MARK = 'SS-02-test';

describe('Employee RLS backstop (SS-02, e2e)', () => {
  let app: INestApplication;
  let scoped: EmployeeScopedPrismaService;
  let owner: PrismaClient; // setup + cleanup (bypasses RLS)
  let empDb: PrismaClient; // raw app_employee connection — no scope helper

  // me: the employee under test · colleague: same company · outsider: other company
  const ids = { me: '', colleague: '', outsider: '' };

  const doc = (clientId: string, employeeId: string | null, title: string) => ({
    clientId,
    employeeId,
    category: 'iqama' as const,
    title: `${MARK} ${title}`,
    fileName: 'x.pdf',
    contentType: 'application/pdf',
    storageKey: `${MARK}/${title}`,
    status: 'available' as const,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    scoped = app.get(EmployeeScopedPrismaService);
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    empDb = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.EMPLOYEE_DATABASE_URL ?? '' }),
    });

    await owner.document.deleteMany({ where: { title: { startsWith: MARK } } });
    await owner.employee.deleteMany({ where: { nameEn: { startsWith: MARK } } });
    const mk = (clientId: string, name: string) =>
      owner.employee.create({
        data: {
          clientId,
          nameAr: 'اختبار',
          nameEn: `${MARK} ${name}`,
          nationality: 'EG',
          contractType: 'unlimited',
        },
      });
    ids.me = (await mk(CLIENT_A, 'me')).id;
    ids.colleague = (await mk(CLIENT_A, 'colleague')).id;
    ids.outsider = (await mk(CLIENT_B, 'outsider')).id;

    await owner.document.createMany({
      data: [
        doc(CLIENT_A, ids.me, 'mine-1'),
        doc(CLIENT_A, ids.me, 'mine-2'),
        doc(CLIENT_A, ids.colleague, 'colleague'),
        doc(CLIENT_B, ids.outsider, 'outsider'),
        // A company-level document (no employee): belongs to the employer, not
        // to any one employee — NULL never equals the scope, so it stays out.
        doc(CLIENT_A, null, 'company'),
      ],
    });
  });

  afterAll(async () => {
    await owner.document.deleteMany({ where: { title: { startsWith: MARK } } });
    await owner.employee.deleteMany({ where: { nameEn: { startsWith: MARK } } });
    await Promise.all([owner.$disconnect(), empDb.$disconnect()]);
    await app.close();
  });

  // ---- Reads are fenced to one record, even with NO filter ----------------

  it('an UNFILTERED employee query returns only my own record', async () => {
    const rows = await scoped.forEmployee(ids.me).employee.findMany();
    expect(rows.map((r) => r.id)).toEqual([ids.me]);
  });

  it('a same-company colleague and an other-company employee are invisible, even by id', async () => {
    const db = scoped.forEmployee(ids.me);
    expect(await db.employee.findUnique({ where: { id: ids.colleague } })).toBeNull();
    expect(await db.employee.findUnique({ where: { id: ids.outsider } })).toBeNull();
    // Filtering by MY company does not widen it to my colleagues.
    const sameCompany = await db.employee.findMany({ where: { clientId: CLIENT_A } });
    expect(sameCompany.map((r) => r.id)).toEqual([ids.me]);
  });

  it("an UNFILTERED document query returns only my documents (not a colleague's, not the company's)", async () => {
    const rows = await scoped.forEmployee(ids.me).document.findMany();
    expect(rows.map((r) => r.title).sort()).toEqual([`${MARK} mine-1`, `${MARK} mine-2`]);
  });

  it("the colleague's own scope sees the colleague — the fence follows the scope, not the company", async () => {
    const rows = await scoped.forEmployee(ids.colleague).document.findMany();
    expect(rows.map((r) => r.title)).toEqual([`${MARK} colleague`]);
  });

  it('an interactive transaction is fenced the same way', async () => {
    const out = await scoped.transaction(ids.me, async (tx) => ({
      employees: await tx.employee.count(),
      documents: await tx.document.count(),
    }));
    expect(out).toEqual({ employees: 1, documents: 2 });
  });

  // ---- Unscoped = nothing (fail closed, SPIKE-001 NULLIF form) ------------

  it('with NO employee scope set, an app_employee session sees zero rows (not an error, not everything)', async () => {
    expect(await empDb.employee.count()).toBe(0);
    expect(await empDb.document.count()).toBe(0);
    // SS-05 granted SELECT on req_requests (an employee's OWN raised requests),
    // so it moved from the permission-denied list to here: unscoped → nothing.
    expect(await empDb.request.count()).toBe(0);
  });

  it('pooled reuse: a scoped query, then an unscoped one on the SAME pool, still sees nothing', async () => {
    // Drive several scoped queries through the pool so its connections have all
    // carried a transaction-local scope, then go unscoped.
    for (let i = 0; i < 12; i++) {
      await empDb.$transaction([
        empDb.$executeRaw`SELECT set_config('app.employee_id', ${ids.me}, TRUE)`,
        empDb.employee.findMany(),
      ]);
    }
    const leftovers = await Promise.all(Array.from({ length: 12 }, () => empDb.employee.count()));
    expect(leftovers.every((n) => n === 0)).toBe(true);
  });

  // ---- No writes, no other tables -----------------------------------------

  it('every write is refused, even to my own record', async () => {
    const db = scoped.forEmployee(ids.me);
    await expect(
      db.employee.update({ where: { id: ids.me }, data: { department: 'changed' } }),
    ).rejects.toThrow(/permission denied/i);
    await expect(db.document.create({ data: doc(CLIENT_A, ids.me, 'injected') })).rejects.toThrow(
      /permission denied/i,
    );
    await expect(db.document.deleteMany({ where: { employeeId: ids.me } })).rejects.toThrow(
      /permission denied/i,
    );
  });

  it.each([
    ['cli_clients', (db: PrismaClient) => db.client.findMany()],
    ['auth_users', (db: PrismaClient) => db.authUser.findMany()],
    ['aud_entries', (db: PrismaClient) => db.auditEntry.findMany()],
    ['gro_processes', (db: PrismaClient) => db.groProcess.findMany()],
    ['task_tasks', (db: PrismaClient) => db.task.findMany()],
  ])('%s is "permission denied" for app_employee', async (_table, read) => {
    await expect(read(empDb)).rejects.toThrow(/permission denied/i);
  });
});
