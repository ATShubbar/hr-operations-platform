import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { requestContext, type RequestContext } from '../src/context/request-context';
import { PrismaClient } from '../src/generated/prisma/client';
import { severityOf } from '../src/modules/audit/public-api';
import { DependantsService } from '../src/modules/employees/public-api';

// DEP-01 (ADR-017): the family on an employee's sponsorship. Staff add, edit and
// remove (soft) through an audited service; the database lets an employee READ
// only their own dependants, gives client managers nothing, and lets nobody —
// staff included — hard-delete a row.
//
// Fixtures are created on the owner connection (bypasses RLS) so assertions
// don't move with the seed.

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const CLIENT_B = '22222222-2222-4222-8222-222222222222';
const STAFF_USER = '00000000-0000-4000-8000-0000000000d1';
const MARK = 'DEP-01-test';

describe('Dependants — table, fences and service (DEP-01, e2e)', () => {
  let app: INestApplication;
  let deps: DependantsService;
  let owner: PrismaClient;
  let staffDb: PrismaClient;
  let clientDb: PrismaClient;
  let empDb: PrismaClient;
  const ids = { me: '', colleague: '', outsider: '' };

  const asStaff = <T>(fn: () => Promise<T>) =>
    requestContext.run(
      {
        requestId: 'dep-01',
        actorId: STAFF_USER,
        principalType: 'staff',
        role: 'gro_officer',
        clientId: null,
        employeeId: null,
      } as unknown as RequestContext,
      fn,
    );

  const scopedMe = <T>(fn: (tx: PrismaClient) => Promise<T>, employeeId = ids.me) =>
    empDb.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.employee_id', ${employeeId}, true)`;
      return fn(tx as unknown as PrismaClient);
    });
  const scopedClient = <T>(fn: (tx: PrismaClient) => Promise<T>) =>
    clientDb.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.client_id', ${CLIENT_A}, true)`;
      return fn(tx as unknown as PrismaClient);
    });

  const spouse = (employeeId: string, nameEn = `${MARK} spouse`) => ({
    employeeId,
    relationship: 'spouse' as const,
    nameEn,
    iqamaNumber: '2123456789',
    iqamaExpiry: new Date('2027-01-15T00:00:00Z'),
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    deps = app.get(DependantsService);
    const db = (url?: string) =>
      new PrismaClient({ adapter: new PrismaPg({ connectionString: url ?? '' }) });
    owner = db(process.env.DATABASE_URL);
    staffDb = db(process.env.STAFF_DATABASE_URL);
    clientDb = db(process.env.CLIENT_DATABASE_URL);
    empDb = db(process.env.EMPLOYEE_DATABASE_URL);

    await cleanup();
    const mk = (clientId: string, name: string) =>
      owner.employee.create({
        data: {
          clientId,
          nameAr: 'اختبار',
          nameEn: `${MARK} ${name}`,
          nationality: 'IN',
          contractType: 'unlimited',
        },
      });
    ids.me = (await mk(CLIENT_A, 'me')).id;
    ids.colleague = (await mk(CLIENT_A, 'colleague')).id;
    ids.outsider = (await mk(CLIENT_B, 'outsider')).id;
  });

  async function cleanup(): Promise<void> {
    const emps = await owner.employee.findMany({
      where: { nameEn: { startsWith: MARK } },
      select: { id: true },
    });
    const employeeIds = emps.map((e) => e.id);
    await owner.dependant.deleteMany({ where: { employeeId: { in: employeeIds } } });
    await owner.auditEntry.deleteMany({
      where: { resource: 'dependant', resourceId: { in: employeeIds } },
    });
    await owner.employee.deleteMany({ where: { id: { in: employeeIds } } });
  }

  afterAll(async () => {
    await cleanup();
    await Promise.all([owner, staffDb, clientDb, empDb].map((c) => c.$disconnect()));
    await app.close();
  });

  describe('the service (staff)', () => {
    it('adds a dependant and audits it against the SPONSOR, without the identifier', async () => {
      const row = await asStaff(() => deps.add(ids.me, spouse(ids.me)));
      expect(row).toMatchObject({ employeeId: ids.me, relationship: 'spouse', removedAt: null });
      expect((await deps.listFor(ids.me)).map((d) => d.id)).toEqual([row.id]);

      const audit = await owner.auditEntry.findFirstOrThrow({
        where: { resource: 'dependant', action: 'create', resourceId: ids.me },
      });
      expect(audit).toMatchObject({ clientId: CLIENT_A, actorId: STAFF_USER });
      expect(audit.after).toMatchObject({ dependantId: row.id, relationship: 'spouse' });
      expect(JSON.stringify(audit.after)).not.toContain('2123456789'); // the iqama number never enters the trail
      expect(severityOf('dependant', 'create')).toBe('notable');
    });

    it('lists spouse first, then children oldest first', async () => {
      const add = (relationship: 'son' | 'daughter', nameEn: string, born: string) =>
        asStaff(() =>
          deps.add(ids.colleague, { relationship, nameEn, dateOfBirth: new Date(born) }),
        );
      await add('son', `${MARK} younger`, '2018-03-01');
      await add('daughter', `${MARK} elder`, '2012-06-01');
      await asStaff(() => deps.add(ids.colleague, spouse(ids.colleague, `${MARK} wife`)));
      expect((await deps.listFor(ids.colleague)).map((d) => d.nameEn)).toEqual([
        `${MARK} wife`,
        `${MARK} elder`,
        `${MARK} younger`,
      ]);
    });

    it('refuses an unknown sponsor (404) and an empty name (400)', async () => {
      await expect(
        asStaff(() =>
          deps.add(
            '33333333-3333-4333-8333-0000000000d1',
            spouse('33333333-3333-4333-8333-0000000000d1'),
          ),
        ),
      ).rejects.toMatchObject({ status: 404 });
      await expect(asStaff(() => deps.add(ids.me, spouse(ids.me, '   ')))).rejects.toMatchObject({
        status: 400,
      });
    });

    it('edits — the audit names WHICH fields changed, never their values', async () => {
      const row = await asStaff(() => deps.add(ids.me, spouse(ids.me, `${MARK} to edit`)));
      const edited = await asStaff(() =>
        deps.update(ids.me, row.id, {
          iqamaNumber: '2999999999',
          passportExpiry: new Date('2030-02-02T00:00:00Z'),
        }),
      );
      expect(edited).toMatchObject({ iqamaNumber: '2999999999' });
      const audit = await owner.auditEntry.findFirstOrThrow({
        where: { resource: 'dependant', action: 'update', resourceId: ids.me },
        orderBy: { id: 'desc' },
      });
      expect((audit.after as { changed: string[] }).changed.sort()).toEqual([
        'iqamaNumber',
        'passportExpiry',
      ]);
      expect(JSON.stringify([audit.before, audit.after])).not.toMatch(
        /2999999999|2123456789|2030-02-02/,
      );
    });

    it('removes softly: off the list, still in the table, audited; then neither editable nor removable again', async () => {
      const row = await asStaff(() => deps.add(ids.me, spouse(ids.me, `${MARK} to remove`)));
      await asStaff(() => deps.remove(ids.me, row.id));
      expect((await deps.listFor(ids.me)).map((d) => d.id)).not.toContain(row.id);
      const kept = await owner.dependant.findUniqueOrThrow({ where: { id: row.id } });
      expect(kept.removedAt).not.toBeNull();
      expect(kept.removedByUserId).toBe(STAFF_USER);
      expect(
        await owner.auditEntry.count({
          where: { resource: 'dependant', action: 'remove', resourceId: ids.me },
        }),
      ).toBe(1);

      await expect(
        asStaff(() => deps.update(ids.me, row.id, { nameAr: 'س' })),
      ).rejects.toMatchObject({ status: 409 });
      await expect(asStaff(() => deps.remove(ids.me, row.id))).rejects.toMatchObject({
        status: 409,
      });
    });

    it("a dependant is only reachable through its OWN sponsor (another employee's id → 404)", async () => {
      const row = await asStaff(() => deps.add(ids.me, spouse(ids.me, `${MARK} mine`)));
      await expect(
        asStaff(() => deps.update(ids.colleague, row.id, { nameAr: 'س' })),
      ).rejects.toMatchObject({ status: 404 });
      await expect(asStaff(() => deps.remove(ids.colleague, row.id))).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('the database fences', () => {
    it('an employee reads ONLY their own dependants — an unfiltered query, colleague and outsider invisible', async () => {
      await asStaff(() => deps.add(ids.outsider, spouse(ids.outsider, `${MARK} outsider family`)));
      const seen = await scopedMe((tx) => tx.dependant.findMany());
      expect(seen.length).toBeGreaterThan(0);
      expect(new Set(seen.map((d) => d.employeeId))).toEqual(new Set([ids.me]));
      // …and the service's self read goes through that fence, removed rows left out.
      const self = await deps.listForSelf(ids.me);
      expect(self.every((d) => d.employeeId === ids.me && d.removedAt === null)).toBe(true);
      expect(self.length).toBe((await deps.listFor(ids.me)).length);
    });

    it('an unscoped employee session sees nothing', async () => {
      expect(await empDb.dependant.count()).toBe(0);
    });

    it('an employee can write nothing', async () => {
      const mine = (await deps.listFor(ids.me))[0]!;
      await expect(
        scopedMe((tx) => tx.dependant.create({ data: spouse(ids.me, `${MARK} forged`) })),
      ).rejects.toThrow();
      await expect(
        scopedMe((tx) =>
          tx.dependant.update({ where: { id: mine.id }, data: { nameEn: `${MARK} hacked` } }),
        ),
      ).rejects.toThrow();
    });

    it('client managers have no access to the table at all', async () => {
      await expect(scopedClient((tx) => tx.dependant.findMany())).rejects.toThrow(
        /permission denied/,
      );
    });

    it('nobody hard-deletes — not even the staff connection', async () => {
      const row = await asStaff(() => deps.add(ids.me, spouse(ids.me, `${MARK} delete attempt`)));
      await expect(staffDb.dependant.delete({ where: { id: row.id } })).rejects.toThrow(
        /permission denied/,
      );
      expect(await owner.dependant.count({ where: { id: row.id } })).toBe(1);
    });
  });
});
