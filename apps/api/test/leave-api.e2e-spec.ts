import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEmployee,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// LEAVE-02 (ADR-014): the leave API, per role, over HTTP. The fixtures live in
// two companies made here — X (self-service ON, so its employee can use /me)
// and Y (the "other company") — so nothing races the seed or other specs.
const MARK = 'LEAVE-02-test';

describe('Leave API (LEAVE-02, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  const co = { x: '', y: '' };
  const emp = { me: '', colleague: '', outsider: '' };
  let admin: TestPrincipal;
  let hr: TestPrincipal;
  let gro: TestPrincipal;
  let auditor: TestPrincipal;
  let managerX: TestPrincipal;
  let managerY: TestPrincipal;
  let me: TestPrincipal & { employeeId: string };

  const http = () => request(app.getHttpServer());
  const nov = (days = 2, extra: object = {}) => ({ type: 'annual', startDate: '2026-11-01', days, ...extra });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });

    const company = (n: string) => owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} ${n}` } });
    co.x = (await company('X')).id;
    co.y = (await company('Y')).id;
    await owner.clientSetting.create({ data: { clientId: co.x, key: 'flag.employee-self-service', value: true } });
    const person = async (clientId: string, name: string) =>
      (
        await owner.employee.create({
          data: { clientId, nameAr: `موظف ${name}`, nameEn: `${MARK} ${name}`, nationality: 'EG', contractType: 'unlimited' },
        })
      ).id;
    emp.me = await person(co.x, 'me');
    emp.colleague = await person(co.x, 'colleague');
    emp.outsider = await person(co.y, 'outsider');

    admin = await loginAsEnrolledStaff(app, 'administrator');
    auditor = await loginAsEnrolledStaff(app, 'auditor');
    hr = await loginAsStaff(app, 'hr_officer');
    gro = await loginAsStaff(app, 'gro_officer');
    managerX = await loginAsClientRep(app, co.x);
    managerY = await loginAsClientRep(app, co.y);
    me = await loginAsEmployee(app, emp.me);
  });

  afterAll(async () => {
    const companies = { in: [co.x, co.y] };
    await owner.leaveEntry.deleteMany({ where: { clientId: companies } });
    await owner.leaveRequest.deleteMany({ where: { clientId: companies } });
    await owner.notification.deleteMany({
      where: { category: 'leave', recipientUserId: { in: [hr.userId, managerX.userId, me.userId] } },
    });
    await cleanupHelperUsers(app);
    await owner.employee.deleteMany({ where: { clientId: companies } });
    await owner.clientSetting.deleteMany({ where: { clientId: companies } });
    await owner.client.deleteMany({ where: { id: companies } });
    await owner.$disconnect();
    await app.close();
  });

  const raise = (who: TestPrincipal, employeeId: string, body = nov()) =>
    http().post('/leave').set('Cookie', who.cookie).send({ employeeId, ...body });
  const act = (who: TestPrincipal, id: string, verb: string) =>
    http().post(`/leave/${id}/${verb}`).set('Cookie', who.cookie);

  it('HR raises → the client manager approves → HR files; the raiser is told at each decision', async () => {
    const raised = await raise(hr, emp.me).expect(201);
    expect(raised.body).toMatchObject({
      status: 'pending',
      clientId: co.x,
      employee: { id: emp.me, nameEn: `${MARK} me`, nameAr: 'موظف me' },
      startDate: '2026-11-01',
      endDate: '2026-11-02',
      raisedBy: { kind: 'staff' },
      raisedByMe: true,
    });
    const id = raised.body.id as string;

    const approved = await act(managerX, id, 'approve').expect(200);
    expect(approved.body).toMatchObject({ status: 'approved', decidedOnBehalf: false, raisedByMe: false });
    // A client manager can never file (no leave.file).
    await act(managerX, id, 'file').expect(403);
    const filed = await act(hr, id, 'file').expect(200);
    expect(filed.body.status).toBe('filed');
    expect(await owner.leaveEntry.count({ where: { requestId: id } })).toBe(1);

    // HR raised it; the client manager approved and HR filed: HR is told of the
    // approval only — not of their own filing.
    const told = await owner.notification.findMany({
      where: { recipientUserId: hr.userId, category: 'leave' },
      select: { data: true },
    });
    expect(told.map((n) => (n.data as { status: string }).status)).toEqual(['approved']);
  });

  it('an Administrator approves on the client’s behalf, and the client manager who raised it is told', async () => {
    const raised = await raise(managerX, emp.colleague).expect(201);
    expect(raised.body.raisedBy.kind).toBe('client');
    const approved = await act(admin, raised.body.id, 'approve').expect(200);
    expect(approved.body).toMatchObject({ status: 'approved', decidedOnBehalf: true });
    const told = await owner.notification.count({ where: { recipientUserId: managerX.userId, category: 'leave' } });
    expect(told).toBe(1);
  });

  it('a client manager reaches only their own company', async () => {
    const theirs = await raise(hr, emp.outsider).expect(201);
    await http().get(`/leave/${theirs.body.id}`).set('Cookie', managerX.cookie).expect(404);
    await act(managerX, theirs.body.id, 'approve').expect(404);
    const list = await http().get('/leave').set('Cookie', managerX.cookie).expect(200);
    expect(list.body.leave.every((r: { clientId: string }) => r.clientId === co.x)).toBe(true);
    // …and cannot raise for another company's employee.
    await raise(managerX, emp.outsider).expect(400);
    // The other company's manager sees their own.
    await http().get(`/leave/${theirs.body.id}`).set('Cookie', managerY.cookie).expect(200);
  });

  it('per role: GRO files but cannot raise or approve; the Auditor only reads; HR cannot approve', async () => {
    await raise(gro, emp.me).expect(403);
    await raise(auditor, emp.me).expect(403);
    await http().get('/leave').set('Cookie', auditor.cookie).expect(200);
    const raised = await raise(hr, emp.colleague).expect(201);
    await act(hr, raised.body.id, 'approve').expect(403);
    await act(gro, raised.body.id, 'approve').expect(403);
    await act(auditor, raised.body.id, 'approve').expect(403);
    await act(managerX, raised.body.id, 'approve').expect(200);
    await act(auditor, raised.body.id, 'file').expect(403);
    await act(gro, raised.body.id, 'file').expect(200);
  });

  it('refuses the statutory limits and malformed input (400), and a lost race (409)', async () => {
    await raise(hr, emp.me, nov(4, { type: 'paternity' })).expect(400);
    await raise(hr, emp.me, nov(0)).expect(400);
    await raise(hr, emp.me, { type: 'annual', startDate: 'not-a-date', days: 2 }).expect(400);
    const raised = await raise(hr, emp.me).expect(201);
    await act(managerX, raised.body.id, 'decline').expect(200);
    await act(managerX, raised.body.id, 'approve').expect(409);
    await act(hr, raised.body.id, 'file').expect(409);
  });

  it('only the raiser withdraws, only while pending', async () => {
    const raised = await raise(hr, emp.me).expect(201);
    await act(managerX, raised.body.id, 'withdraw').expect(403);
    await act(admin, raised.body.id, 'withdraw').expect(403);
    const done = await act(hr, raised.body.id, 'withdraw').expect(200);
    expect(done.body.status).toBe('withdrawn');
  });

  describe('the employee, through /me/leave', () => {
    it('raises for themselves only — an employee id in the body is refused', async () => {
      const mine = await http().post('/me/leave').set('Cookie', me.cookie).send(nov(1)).expect(201);
      expect(mine.body).toMatchObject({ employee: { id: emp.me }, raisedBy: { kind: 'employee' }, raisedByMe: true });
      await http()
        .post('/me/leave')
        .set('Cookie', me.cookie)
        .send({ ...nov(1), employeeId: emp.colleague })
        .expect(400);
    });

    it('sees every request about them (whoever raised it), none of a colleague’s', async () => {
      const forMe = await raise(managerX, emp.me).expect(201);
      const forColleague = await raise(managerX, emp.colleague).expect(201);
      const res = await http().get('/me/leave').set('Cookie', me.cookie).expect(200);
      const ids = res.body.leave.map((r: { id: string }) => r.id);
      expect(ids).toContain(forMe.body.id);
      expect(ids).not.toContain(forColleague.body.id);
      expect(res.body.leave.every((r: { employee: { id: string } }) => r.employee.id === emp.me)).toBe(true);
      // Raised FOR me by my manager: visible, not mine to withdraw.
      await http().post(`/me/leave/${forMe.body.id}/withdraw`).set('Cookie', me.cookie).expect(403);
      await http().post(`/me/leave/${forColleague.body.id}/withdraw`).set('Cookie', me.cookie).expect(404);
    });

    it('withdraws what they raised; the staff routes stay closed to them', async () => {
      const mine = await http().post('/me/leave').set('Cookie', me.cookie).send(nov(1)).expect(201);
      const done = await http().post(`/me/leave/${mine.body.id}/withdraw`).set('Cookie', me.cookie).expect(200);
      expect(done.body.status).toBe('withdrawn');
      await http().get('/leave').set('Cookie', me.cookie).expect(403);
      await raise(me, emp.me).expect(403);
    });

    it('is told when their request is decided', async () => {
      const mine = await http().post('/me/leave').set('Cookie', me.cookie).send(nov(3)).expect(201);
      await act(managerX, mine.body.id, 'approve').expect(200);
      const told = await owner.notification.findMany({
        where: { recipientUserId: me.userId, category: 'leave' },
        select: { titleEn: true, titleAr: true },
      });
      expect(told).toHaveLength(1);
      expect(told[0]!.titleEn).toBe(`Annual leave ${mine.body.ref}: approved`);
      expect(told[0]!.titleAr).toContain(mine.body.ref);
    });
  });
});
