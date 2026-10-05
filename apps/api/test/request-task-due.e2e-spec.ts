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
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// TASK-05: the task a request spawns is due WHEN THE REQUEST IS DUE — the
// request's own service level, in its company's working week (THREAD-04) — not a
// fixed "3 Sun–Thu working days". And while the task is open it FOLLOWS the
// request's due date whenever that moves (a hand edit, a snooze, the pause while
// waiting on the requester — either direction). A finished task is left alone.
const MARK = 'TASK-05-test';
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null);

describe('A spawned task follows its request’s due date (TASK-05, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  const co = { x: '', mf: '' };
  let hr: TestPrincipal;
  let managerX: TestPrincipal;
  let managerMf: TestPrincipal;
  let me: TestPrincipal & { employeeId: string };

  const http = () => request(app.getHttpServer());
  const due = async (requestId: string) =>
    iso((await owner.request.findUniqueOrThrow({ where: { id: requestId } })).dueDate);
  const taskOf = (requestId: string) => owner.task.findFirstOrThrow({ where: { requestId } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });
    co.x = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} X` } })).id;
    co.mf = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} Mon-Fri` } })).id;
    await owner.clientSetting.createMany({
      data: [
        { clientId: co.x, key: 'flag.employee-self-service', value: true },
        { clientId: co.mf, key: 'working.week', value: [1, 2, 3, 4, 5] },
      ],
    });
    const empId = (
      await owner.employee.create({
        data: { clientId: co.x, nameAr: 'موظف', nameEn: `${MARK} me`, nationality: 'EG', contractType: 'unlimited' },
      })
    ).id;
    hr = await loginAsStaff(app, 'hr_officer');
    managerX = await loginAsClientRep(app, co.x);
    managerMf = await loginAsClientRep(app, co.mf);
    me = await loginAsEmployee(app, empId);
  });

  afterAll(async () => {
    const companies = { in: [co.x, co.mf] };
    const ids = (await owner.request.findMany({ where: { clientId: companies }, select: { id: true } })).map((r) => r.id);
    await owner.task.deleteMany({ where: { requestId: { in: ids } } });
    await owner.requestComment.deleteMany({ where: { clientId: companies } });
    await owner.request.deleteMany({ where: { clientId: companies } });
    await owner.notification.deleteMany({
      where: { recipientUserId: { in: [hr.userId, managerX.userId, managerMf.userId, me.userId] } },
    });
    await cleanupHelperUsers(app);
    await owner.employee.deleteMany({ where: { clientId: companies } });
    await owner.clientSetting.deleteMany({ where: { clientId: companies } });
    await owner.client.deleteMany({ where: { id: companies } });
    await owner.$disconnect();
    await app.close();
  });

  describe('the spawned task is due when its request is', () => {
    it('staff path — a GRO service (5 working days), not the old fixed 3', async () => {
      const r = await http().post('/requests').set('Cookie', hr.cookie)
        .send({ clientId: co.x, type: 'gro_service', title: `${MARK} staff` }).expect(201);
      expect(iso((await taskOf(r.body.id)).dueDate)).toBe(iso(r.body.dueDate));
    });

    it('client path, in a Mon–Fri company', async () => {
      const r = await http().post('/requests').set('Cookie', managerMf.cookie)
        .send({ type: 'document', title: `${MARK} client` }).expect(201);
      expect(iso((await taskOf(r.body.id)).dueDate)).toBe(iso(r.body.dueDate));
    });

    it('employee path — the date the system sets after the raise', async () => {
      const r = await http().post('/me/requests').set('Cookie', me.cookie)
        .send({ type: 'certificate', title: `${MARK} employee` }).expect(201);
      const requestDue = await due(r.body.id);
      expect(requestDue).not.toBeNull();
      expect(iso((await taskOf(r.body.id)).dueDate)).toBe(requestDue);
    });
  });

  describe('and follows it while the task is open', () => {
    const raise = async () =>
      (await http().post('/requests').set('Cookie', hr.cookie)
        .send({ clientId: co.x, type: 'letter', title: `${MARK} follow` }).expect(201)).body as { id: string };

    it('a hand edit or a snooze moves the task too — later or earlier; clearing clears it', async () => {
      const r = await raise();
      const patch = (dueDate: string | null) =>
        http().patch(`/requests/${r.id}`).set('Cookie', hr.cookie).send({ dueDate }).expect(200);
      await patch('2026-12-20');
      expect(iso((await taskOf(r.id)).dueDate)).toBe('2026-12-20');
      await patch('2026-11-02');
      expect(iso((await taskOf(r.id)).dueDate)).toBe('2026-11-02');
      await patch(null);
      expect((await taskOf(r.id)).dueDate).toBeNull();
    });


    it('the pause while waiting on the requester moves it — by a reply, or by staff moving it on', async () => {
      for (const endBy of ['reply', 'staff'] as const) {
        const r = (await http().post('/requests').set('Cookie', managerX.cookie)
          .send({ type: 'letter', title: `${MARK} pause ${endBy}` }).expect(201)).body as { id: string };
        await owner.request.update({ where: { id: r.id }, data: { dueDate: new Date('2026-12-01T00:00:00Z') } });
        await owner.task.updateMany({ where: { requestId: r.id }, data: { dueDate: new Date('2026-12-01T00:00:00Z') } });
        await http().post(`/requests/${r.id}/process`).set('Cookie', hr.cookie)
          .send({ status: 'info_needed', note: 'Which bank?' }).expect(200);
        await owner.request.update({ where: { id: r.id }, data: { infoNeededSince: new Date(Date.now() - 9 * 86_400_000) } });
        if (endBy === 'reply') {
          await http().post(`/requests/${r.id}/comments`).set('Cookie', managerX.cookie).send({ body: 'Al Rajhi.' }).expect(201);
        } else {
          await http().post(`/requests/${r.id}/process`).set('Cookie', hr.cookie).send({ status: 'open' }).expect(200);
        }
        const requestDue = await due(r.id);
        expect(requestDue).not.toBe('2026-12-01'); // the pause moved it…
        expect(iso((await taskOf(r.id)).dueDate)).toBe(requestDue); // …and the task with it
      }
    });

    it('a finished task is left alone', async () => {
      const r = await raise();
      const task = await taskOf(r.id);
      await owner.task.update({ where: { id: task.id }, data: { status: 'done' } });
      const before = iso(task.dueDate);
      await http().patch(`/requests/${r.id}`).set('Cookie', hr.cookie).send({ dueDate: '2027-01-14' }).expect(200);
      expect(iso((await owner.task.findUniqueOrThrow({ where: { id: task.id } })).dueDate)).toBe(before);
    });
  });
});
