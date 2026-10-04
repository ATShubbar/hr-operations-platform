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

// REQ-05: reassign an APPROVED request (in progress / info needed) without
// moving its status — staff with request.process; never to nobody; the new
// assignee is told (not when you take it yourself). And the assignee must be a
// person who works on requests: an active staff account whose role holds
// request.process — checked on this route AND on `process` (which used to take
// any id at all).
const MARK = 'REQ-05-test';
const TITLE = 'A request was assigned to you';

describe('Reassign a request (REQ-05, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let co = '';
  let hr: TestPrincipal;
  let gro: TestPrincipal;
  let auditor: TestPrincipal;
  let disabled: TestPrincipal;
  let manager: TestPrincipal;
  let me: TestPrincipal & { employeeId: string };

  const http = () => request(app.getHttpServer());
  const mk = (status: 'open' | 'in_progress' | 'info_needed' | 'resolved' | 'closed' | 'cancelled', extra: object = {}) =>
    owner.request.create({
      data: {
        clientId: co,
        type: 'letter',
        title: `${MARK} ${status}`,
        createdByUserId: manager.userId,
        status,
        ...(status === 'info_needed' ? { infoReturnsTo: 'in_progress', infoNeededSince: new Date() } : {}),
        ...extra,
      },
    });
  const assign = (who: TestPrincipal, id: string, body: unknown) =>
    http().post(`/requests/${id}/assign`).set('Cookie', who.cookie).send(body as object);
  const told = (userId: string) => owner.notification.count({ where: { recipientUserId: userId, titleEn: TITLE } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });
    co = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} X` } })).id;
    await owner.clientSetting.create({ data: { clientId: co, key: 'flag.employee-self-service', value: true } });
    const empId = (
      await owner.employee.create({
        data: { clientId: co, nameAr: 'موظف', nameEn: `${MARK} me`, nationality: 'EG', contractType: 'unlimited' },
      })
    ).id;
    hr = await loginAsStaff(app, 'hr_officer');
    gro = await loginAsStaff(app, 'gro_officer');
    auditor = await loginAsEnrolledStaff(app, 'auditor');
    disabled = await loginAsStaff(app, 'hr_officer');
    await owner.authUser.update({ where: { id: disabled.userId }, data: { status: 'disabled' } });
    manager = await loginAsClientRep(app, co);
    me = await loginAsEmployee(app, empId);
  });

  afterAll(async () => {
    const ids = (await owner.request.findMany({ where: { clientId: co }, select: { id: true } })).map((r) => r.id);
    await owner.task.deleteMany({ where: { requestId: { in: ids } } });
    await owner.requestComment.deleteMany({ where: { clientId: co } });
    await owner.request.deleteMany({ where: { clientId: co } });
    await owner.notification.deleteMany({
      where: { recipientUserId: { in: [hr.userId, gro.userId, manager.userId, me.userId, disabled.userId] } },
    });
    await cleanupHelperUsers(app);
    await owner.employee.deleteMany({ where: { clientId: co } });
    await owner.clientSetting.deleteMany({ where: { clientId: co } });
    await owner.client.deleteMany({ where: { id: co } });
    await owner.$disconnect();
    await app.close();
  });

  it('reassigns an in-progress request: the status stays, the new assignee is told, it is audited and on the trail', async () => {
    const r = await mk('in_progress', { assigneeUserId: hr.userId });
    const before = await told(gro.userId);
    const res = await assign(hr, r.id, { assigneeUserId: gro.userId }).expect(200);
    expect(res.body).toMatchObject({ status: 'in_progress', assigneeUserId: gro.userId });
    expect(await told(gro.userId)).toBe(before + 1);
    const audit = await owner.auditEntry.findFirst({ where: { resource: 'request', resourceId: r.id, action: 'assign' } });
    expect(audit?.after).toMatchObject({ assigneeUserId: gro.userId });
    const trail = await http().get(`/requests/${r.id}/history`).set('Cookie', hr.cookie).expect(200);
    expect(trail.body.entries.map((e: { action: string }) => e.action)).toContain('assign');
  });

  it('reassigns while waiting on the requester — the wait is untouched', async () => {
    const r = await mk('info_needed', { assigneeUserId: hr.userId });
    await assign(gro, r.id, { assigneeUserId: gro.userId }).expect(200);
    const row = await owner.request.findUniqueOrThrow({ where: { id: r.id } });
    expect(row).toMatchObject({ status: 'info_needed', assigneeUserId: gro.userId, infoReturnsTo: 'in_progress' });
    expect(row.infoNeededSince).not.toBeNull();
  });

  it('taking it yourself tells nobody', async () => {
    const r = await mk('in_progress', { assigneeUserId: hr.userId });
    const before = await told(gro.userId);
    await assign(gro, r.id, { assigneeUserId: gro.userId }).expect(200);
    expect(await told(gro.userId)).toBe(before);
  });

  it('only approved requests: open and finished ones are refused', async () => {
    for (const status of ['open', 'resolved', 'closed', 'cancelled'] as const) {
      const r = await mk(status);
      await assign(hr, r.id, { assigneeUserId: gro.userId }).expect(400);
      expect((await owner.request.findUniqueOrThrow({ where: { id: r.id } })).assigneeUserId).toBeNull();
    }
  });

  it('never to nobody, and only to someone who works on requests', async () => {
    const r = await mk('in_progress', { assigneeUserId: hr.userId });
    await assign(hr, r.id, { assigneeUserId: null }).expect(400);
    await assign(hr, r.id, {}).expect(400);
    for (const wrong of [manager.userId, me.userId, auditor.userId, disabled.userId, '33333333-3333-4333-8333-000000000099']) {
      await assign(hr, r.id, { assigneeUserId: wrong }).expect(400);
    }
    expect((await owner.request.findUniqueOrThrow({ where: { id: r.id } })).assigneeUserId).toBe(hr.userId);
  });

  it('`process` checks its assignee the same way (it used to take any id)', async () => {
    const r = await mk('open');
    await http()
      .post(`/requests/${r.id}/process`)
      .set('Cookie', hr.cookie)
      .send({ status: 'in_progress', assigneeUserId: manager.userId })
      .expect(400);
    expect((await owner.request.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('open');
    // …and approving with a real officer still works, and tells them.
    const before = await told(gro.userId);
    await http()
      .post(`/requests/${r.id}/process`)
      .set('Cookie', hr.cookie)
      .send({ status: 'in_progress', assigneeUserId: gro.userId })
      .expect(200);
    expect(await told(gro.userId)).toBe(before + 1);
  });

  it('client managers, the Auditor and employees cannot reassign; an unknown request is 404', async () => {
    const r = await mk('in_progress', { assigneeUserId: hr.userId });
    await assign(manager, r.id, { assigneeUserId: gro.userId }).expect(403);
    await assign(auditor, r.id, { assigneeUserId: gro.userId }).expect(403);
    await assign(me, r.id, { assigneeUserId: gro.userId }).expect(403);
    await assign(hr, '33333333-3333-4333-8333-000000000098', { assigneeUserId: gro.userId }).expect(404);
  });
});
