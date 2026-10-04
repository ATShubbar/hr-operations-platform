import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { type RequestContext, requestContext } from '../src/context/request-context';
import { PrismaClient } from '../src/generated/prisma/client';
import { LeaveService } from '../src/modules/leave/public-api';

// LEAVE-01 (ADR-014): leave requests + the ledger. Two layers, both proven:
//   1. the DATABASE fences each audience (raw app_client / app_employee
//      connections, no service in between) — a bug or a forged write cannot
//      cross a company, reach a colleague, or make a move that role may not;
//   2. the SERVICE runs the workflow, the statutory rules and the audit.
// Fixtures are made here with the owner connection (bypasses RLS), so the
// assertions don't move when the seed does.

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const CLIENT_B = '22222222-2222-4222-8222-222222222222';
const MARK = 'LEAVE-01-test';
const STAFF_USER = 'a0000001-0000-4000-8000-0000000000f1';
const CLIENT_USER = 'a0000001-0000-4000-8000-0000000000f2';
const OTHER_STAFF = 'a0000001-0000-4000-8000-0000000000f3';
const EMP_USER = 'a0000001-0000-4000-8000-0000000000f4';

describe('Leave (LEAVE-01, e2e)', () => {
  let app: INestApplication;
  let leave: LeaveService;
  let owner: PrismaClient;
  let clientDb: PrismaClient;
  let empDb: PrismaClient;
  const ids = { me: '', colleague: '', outsider: '', leaver: '' };

  const ctx = (c: Partial<RequestContext>): RequestContext => ({
    requestId: `${MARK}-${Math.random()}`,
    actorId: null,
    clientId: null,
    employeeId: null,
    principalType: null,
    role: null,
    ...c,
  });
  const asStaff = <T>(fn: () => Promise<T>, actorId = STAFF_USER) =>
    requestContext.run(ctx({ actorId, principalType: 'staff', role: 'administrator' }), fn);
  const asClient = <T>(fn: () => Promise<T>) =>
    requestContext.run(
      ctx({ actorId: CLIENT_USER, clientId: CLIENT_A, principalType: 'client_rep', role: 'client_manager' }),
      fn,
    );
  const asMe = <T>(fn: () => Promise<T>) =>
    requestContext.run(
      ctx({ actorId: EMP_USER, employeeId: ids.me, principalType: 'employee', role: 'employee' }),
      fn,
    );

  const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
  const annual = (employeeId: string, days = 3) => ({
    employeeId,
    type: 'annual' as const,
    startDate: day('2026-11-01'),
    days,
  });

  // Run statements on a raw role connection with a transaction-local scope —
  // exactly what the scoped services do, minus the service.
  const scopedClient = <T>(fn: (tx: PrismaClient) => Promise<T>) =>
    clientDb.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.client_id', ${CLIENT_A}, true)`;
      return fn(tx as unknown as PrismaClient);
    });
  const scopedMe = <T>(fn: (tx: PrismaClient) => Promise<T>) =>
    empDb.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.employee_id', ${ids.me}, true)`;
      return fn(tx as unknown as PrismaClient);
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    leave = app.get(LeaveService);
    const db = (url?: string) =>
      new PrismaClient({ adapter: new PrismaPg({ connectionString: url ?? '' }) });
    owner = db(process.env.DATABASE_URL);
    clientDb = db(process.env.CLIENT_DATABASE_URL);
    empDb = db(process.env.EMPLOYEE_DATABASE_URL);

    await cleanup();
    const mk = (clientId: string, name: string, employmentStatus: 'active' | 'terminated' = 'active') =>
      owner.employee.create({
        data: {
          clientId,
          nameAr: 'اختبار',
          nameEn: `${MARK} ${name}`,
          nationality: 'EG',
          contractType: 'unlimited',
          employmentStatus,
        },
      });
    ids.me = (await mk(CLIENT_A, 'me')).id;
    ids.colleague = (await mk(CLIENT_A, 'colleague')).id;
    ids.outsider = (await mk(CLIENT_B, 'outsider')).id;
    ids.leaver = (await mk(CLIENT_A, 'leaver', 'terminated')).id;
  });

  async function cleanup(): Promise<void> {
    const emps = await owner.employee.findMany({
      where: { nameEn: { startsWith: MARK } },
      select: { id: true },
    });
    const employeeId = { in: emps.map((e) => e.id) };
    await owner.leaveEntry.deleteMany({ where: { employeeId } });
    await owner.leaveRequest.deleteMany({ where: { employeeId } });
    await owner.employee.deleteMany({ where: { nameEn: { startsWith: MARK } } });
  }

  afterAll(async () => {
    await cleanup();
    await owner.$disconnect();
    await clientDb.$disconnect();
    await empDb.$disconnect();
    await app.close();
  });

  // ---- the service ---------------------------------------------------------

  describe('the workflow, through the service', () => {
    it('raise → approve (client) → file (staff) writes the ledger entry, audited at each step', async () => {
      const raised = await asStaff(() => leave.raise(annual(ids.me, 5)));
      expect(raised).toMatchObject({ status: 'pending', clientId: CLIENT_A, days: 5 });
      expect(raised.ref).toMatch(/^LV-\d{4,}$/);
      expect(raised.endDate).toEqual(day('2026-11-05'));

      const approved = await asClient(() => leave.decideForClient(CLIENT_A, raised.id, 'approved'));
      expect(approved).toMatchObject({ status: 'approved', decidedByUserId: CLIENT_USER, decidedOnBehalf: false });

      const filed = await asStaff(() => leave.file(raised.id));
      expect(filed).toMatchObject({ status: 'filed', filedByUserId: STAFF_USER });
      const entry = await owner.leaveEntry.findUnique({ where: { requestId: raised.id } });
      expect(entry).toMatchObject({ kind: 'taken', type: 'annual', days: 5, leaveYear: 2026, employeeId: ids.me });

      const audit = await owner.auditEntry.findMany({
        where: { resource: 'leave', resourceId: raised.id },
        orderBy: { id: 'asc' },
        select: { action: true, clientId: true },
      });
      expect(audit.map((a) => a.action)).toEqual(['create', 'approve', 'file']);
      expect(audit.every((a) => a.clientId === CLIENT_A)).toBe(true);
    });

    it('an Administrator deciding is recorded as on the client’s behalf', async () => {
      const raised = await asStaff(() => leave.raise(annual(ids.colleague)));
      const declined = await asStaff(() => leave.decide(raised.id, 'declined'));
      expect(declined).toMatchObject({ status: 'declined', decidedOnBehalf: true });
    });

    it('a decided request cannot be decided again, filed twice, or filed before approval (409)', async () => {
      const raised = await asStaff(() => leave.raise(annual(ids.me)));
      await expect(asStaff(() => leave.file(raised.id))).rejects.toMatchObject({ status: 409 });
      await asClient(() => leave.decideForClient(CLIENT_A, raised.id, 'approved'));
      await expect(asClient(() => leave.decideForClient(CLIENT_A, raised.id, 'declined'))).rejects.toMatchObject({ status: 409 });
      await asStaff(() => leave.file(raised.id));
      await expect(asStaff(() => leave.file(raised.id))).rejects.toMatchObject({ status: 409 });
    });

    it('two people deciding at once: exactly one wins, the other gets 409', async () => {
      const raised = await asStaff(() => leave.raise(annual(ids.me)));
      const results = await Promise.allSettled([
        asClient(() => leave.decideForClient(CLIENT_A, raised.id, 'approved')),
        asStaff(() => leave.decide(raised.id, 'declined')),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(lost.reason).toMatchObject({ status: 409 });
    });

    it('refuses over-cap, a second Hajj, and a leaver (400)', async () => {
      await expect(
        asStaff(() => leave.raise({ ...annual(ids.me), type: 'paternity', days: 4 })),
      ).rejects.toMatchObject({ status: 400 });
      await asStaff(() => leave.raise({ ...annual(ids.colleague), type: 'hajj', days: 15 }));
      await expect(
        asStaff(() => leave.raise({ ...annual(ids.colleague), type: 'hajj', days: 5 })),
      ).rejects.toMatchObject({ status: 400 });
      await expect(asStaff(() => leave.raise(annual(ids.leaver)))).rejects.toMatchObject({ status: 400 });
    });

    it('a client manager raises only for their own company’s people', async () => {
      const own = await asClient(() => leave.raiseForClient(CLIENT_A, annual(ids.colleague)));
      expect(own).toMatchObject({ clientId: CLIENT_A, raisedByUserId: CLIENT_USER });
      await expect(
        asClient(() => leave.raiseForClient(CLIENT_A, annual(ids.outsider))),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('only the raiser withdraws, only while pending', async () => {
      const mine = await asStaff(() => leave.raise(annual(ids.me)));
      await expect(asStaff(() => leave.withdraw(mine.id), OTHER_STAFF)).rejects.toMatchObject({ status: 403 });
      expect(await asStaff(() => leave.withdraw(mine.id))).toMatchObject({ status: 'withdrawn' });
      await expect(asStaff(() => leave.withdraw(mine.id))).rejects.toMatchObject({ status: 409 });
    });

    it('an employee raises for themselves, sees their own leave, withdraws what they raised', async () => {
      const raised = await asMe(() =>
        leave.raiseForEmployee(ids.me, CLIENT_A, { type: 'annual', startDate: day('2026-12-01'), days: 2 }),
      );
      expect(raised).toMatchObject({ raisedByEmployeeId: ids.me, raisedByUserId: EMP_USER, status: 'pending' });

      // Raised FOR me by my manager: visible to me (it is my leave), not mine to withdraw.
      const byManager = await asClient(() => leave.raiseForClient(CLIENT_A, annual(ids.me)));
      const mine = await asMe(() => leave.listForEmployee(ids.me));
      expect(mine.map((r) => r.id)).toEqual(expect.arrayContaining([raised.id, byManager.id]));
      expect(mine.every((r) => r.employeeId === ids.me)).toBe(true);
      await expect(asMe(() => leave.withdrawForEmployee(ids.me, byManager.id))).rejects.toMatchObject({ status: 403 });

      expect(await asMe(() => leave.withdrawForEmployee(ids.me, raised.id))).toMatchObject({ status: 'withdrawn' });
      // A colleague's request is not there at all.
      const theirs = await asStaff(() => leave.raise(annual(ids.colleague)));
      expect(await asMe(() => leave.findForEmployee(ids.me, theirs.id))).toBeNull();
    });
  });

  // ---- the database fence (no service) ----------------------------------------

  describe('app_client, scoped to company A', () => {
    it('sees its own company’s leave only', async () => {
      const a = await asStaff(() => leave.raise(annual(ids.colleague)));
      const b = await asStaff(() => leave.raise(annual(ids.outsider)));
      const seen = await scopedClient((tx) => tx.leaveRequest.findMany({ select: { id: true, clientId: true } }));
      expect(seen.some((r) => r.id === a.id)).toBe(true);
      expect(seen.some((r) => r.id === b.id)).toBe(false);
      expect(seen.every((r) => r.clientId === CLIENT_A)).toBe(true);
    });

    it('cannot raise for another company’s employee, or raise one already approved', async () => {
      const row = (employeeId: string, extra: object = {}) => ({
        clientId: CLIENT_A,
        employeeId,
        type: 'annual' as const,
        startDate: day('2026-11-01'),
        days: 1,
        endDate: day('2026-11-01'),
        raisedByUserId: CLIENT_USER,
        ...extra,
      });
      await expect(scopedClient((tx) => tx.leaveRequest.create({ data: row(ids.outsider) }))).rejects.toThrow();
      await expect(
        scopedClient((tx) =>
          tx.leaveRequest.create({
            data: row(ids.colleague, { status: 'approved', decidedByUserId: CLIENT_USER, decidedAt: new Date() }),
          }),
        ),
      ).rejects.toThrow();
    });

    it('can never file, re-decide a decided request, or write the ledger', async () => {
      const raised = await asStaff(() => leave.raise(annual(ids.colleague)));
      // pending → filed: refused (filing columns aren't even granted).
      await expect(
        scopedClient((tx) =>
          tx.leaveRequest.update({
            where: { id: raised.id },
            data: { status: 'filed', filedByUserId: CLIENT_USER, filedAt: new Date() },
          }),
        ),
      ).rejects.toThrow();
      await asClient(() => leave.decideForClient(CLIENT_A, raised.id, 'approved'));
      // approved is no longer pending: the update policy's USING hides it → 0 rows.
      const { count } = await scopedClient((tx) =>
        tx.leaveRequest.updateMany({ where: { id: raised.id }, data: { status: 'declined' } }),
      );
      expect(count).toBe(0);
      await expect(
        scopedClient((tx) =>
          tx.leaveEntry.create({
            data: {
              clientId: CLIENT_A,
              employeeId: ids.colleague,
              kind: 'carried',
              type: 'annual',
              days: 10,
              leaveYear: 2026,
              createdByUserId: CLIENT_USER,
            },
          }),
        ),
      ).rejects.toThrow();
    });
  });

  describe('app_employee, scoped to ONE employee', () => {
    it('sees nothing of a same-company colleague', async () => {
      const theirs = await asStaff(() => leave.raise(annual(ids.colleague)));
      const seen = await scopedMe((tx) => tx.leaveRequest.findMany({ select: { employeeId: true, id: true } }));
      expect(seen.every((r) => r.employeeId === ids.me)).toBe(true);
      expect(seen.some((r) => r.id === theirs.id)).toBe(false);
    });

    it('cannot raise for a colleague, or raise one pre-approved', async () => {
      const row = (employeeId: string, extra: object = {}) => ({
        clientId: CLIENT_A,
        employeeId,
        raisedByEmployeeId: ids.me,
        type: 'annual' as const,
        startDate: day('2026-11-01'),
        days: 1,
        endDate: day('2026-11-01'),
        raisedByUserId: EMP_USER,
        ...extra,
      });
      await expect(scopedMe((tx) => tx.leaveRequest.create({ data: row(ids.colleague) }))).rejects.toThrow();
      await expect(
        scopedMe((tx) =>
          tx.leaveRequest.create({
            data: row(ids.me, { status: 'approved', decidedByUserId: EMP_USER, decidedAt: new Date() }),
          }),
        ),
      ).rejects.toThrow();
    });

    it('cannot approve their own leave, only withdraw what they raised', async () => {
      const raised = await asMe(() =>
        leave.raiseForEmployee(ids.me, CLIENT_A, { type: 'annual', startDate: day('2027-01-10'), days: 1 }),
      );
      const approve = await scopedMe((tx) =>
        tx.leaveRequest.updateMany({ where: { id: raised.id }, data: { status: 'approved' } }),
      ).catch((e: unknown) => e);
      // Either refused outright or zero rows — never approved.
      const after = await owner.leaveRequest.findUniqueOrThrow({ where: { id: raised.id } });
      expect(after.status).toBe('pending');
      expect(approve).toBeDefined();
    });
  });
});
