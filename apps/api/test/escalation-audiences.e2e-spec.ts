import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { EscalationItem, EscalationLadderResponse } from '@hr/contracts';
import { dayIn } from '@hr/dates';
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

// NC-05 (ADR-021): the ladder for the two audiences outside staff.
//
// A CLIENT MANAGER is told only at Breach — a lapsed document of one of their
// people (while their portal is on) and one of their company's requests past
// its service level — and nothing of another company, a dependant, a
// procedure, a task or a member of staff's name.
//
// An EMPLOYEE sees the items about their own record — their documents, their
// dependants', the requests they raised — at every stage, and nothing of a
// colleague, while their company has self-service switched on.
const MARK = 'NC-05-test';
const db = (url?: string) =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString: url ?? '' }) });
const day = (offset: number): Date => {
  const d = dayIn(new Date(), 'Asia/Riyadh');
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};

describe('The ladder for client managers and employees (NC-05, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let hr: TestPrincipal;
  let officer: TestPrincipal;
  let repX: TestPrincipal;
  let repX2: TestPrincipal;
  let repY: TestPrincipal;
  let me: TestPrincipal & { employeeId: string };
  let colleague: TestPrincipal & { employeeId: string };
  const ids = { x: '', y: '', a: '', b: '', leaver: '', other: '', depA: '', depB: '' };
  const req = { lateX: '', soonX: '', lateY: '', mine: '', colleagues: '' };

  const http = () => request(app.getHttpServer());
  const get = (path: string, who: TestPrincipal) => http().get(path).set('Cookie', who.cookie);
  const ladderOf = async (path: string, who: TestPrincipal): Promise<EscalationLadderResponse> =>
    (await get(path, who).expect(200)).body;
  const keys = (l: EscalationLadderResponse) => l.items.map((i) => i.key).sort();
  const flag = (clientId: string, key: string, value: boolean) =>
    owner.clientSetting.upsert({
      where: { clientId_key: { clientId, key } },
      create: { clientId, key, value },
      update: { value },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = db(process.env.DATABASE_URL);
    await cleanup();
    hr = await loginAsStaff(app, 'hr_officer');
    officer = await loginAsStaff(app, 'gro_officer');
    await owner.authUser.update({
      where: { id: officer.userId },
      data: { displayName: 'Turki Test' },
    });

    ids.x = (
      await owner.client.create({
        data: { nameAr: 'شركة س', nameEn: `${MARK} X`, officerUserId: officer.userId },
      })
    ).id;
    ids.y = (await owner.client.create({ data: { nameAr: 'شركة ص', nameEn: `${MARK} Y` } })).id;
    const person = (clientId: string, name: string, over: object = {}) =>
      owner.employee.create({
        data: {
          clientId,
          nameAr: 'اختبار',
          nameEn: `${MARK} ${name}`,
          nationality: 'IN',
          contractType: 'unlimited',
          ...over,
        },
      });
    // a: a lapsed iqama, a permit at Escalated, a passport at Reminder, a contract at Notice.
    ids.a = (
      await person(ids.x, 'a', {
        iqamaExpiry: day(-3),
        workPermitExpiry: day(5),
        passportExpiry: day(12),
        contractEndDate: day(25),
      })
    ).id;
    // b: a lapsed contract, and a lapsed permit that is ALREADY being renewed.
    ids.b = (await person(ids.x, 'b', { contractEndDate: day(-8), workPermitExpiry: day(-2) })).id;
    ids.leaver = (
      await person(ids.x, 'left', { employmentStatus: 'terminated', passportExpiry: day(-30) })
    ).id;
    ids.other = (await person(ids.y, 'other', { iqamaExpiry: day(-5) })).id;
    const dep = (employeeId: string, name: string) =>
      owner.dependant.create({
        data: {
          employeeId,
          relationship: 'spouse',
          nameEn: `${MARK} ${name}`,
          iqamaExpiry: day(-1),
        },
      });
    ids.depA = (await dep(ids.a, 'spouse of a')).id;
    ids.depB = (await dep(ids.b, 'spouse of b')).id;
    await owner.groProcess.createMany({
      data: [
        // Keeps b's permit quiet.
        { clientId: ids.x, employeeId: ids.b, type: 'work_permit_renewal', status: 'submitted' },
        // A procedure past its deadline — staff work, never a client's or an employee's item.
        {
          clientId: ids.x,
          employeeId: ids.a,
          type: 'exit_reentry',
          status: 'in_progress',
          dueDate: day(-4),
          assigneeUserId: officer.userId,
        },
      ],
    });
    await owner.task.create({
      data: {
        clientId: ids.x,
        title: `${MARK} task`,
        dueDate: day(-4),
        createdByUserId: hr.userId,
      },
    });
    const mkReq = async (clientId: string, title: string, due: number, over: object = {}) =>
      (
        await owner.request.create({
          data: {
            clientId,
            type: 'letter',
            title: `${MARK} ${title}`,
            dueDate: day(due),
            createdByUserId: hr.userId,
            ...over,
          },
        })
      ).id;
    req.lateX = await mkReq(ids.x, 'late at X', -2, { assigneeUserId: hr.userId });
    req.soonX = await mkReq(ids.x, 'soon at X', 1);
    req.lateY = await mkReq(ids.y, 'late at Y', -2);

    repX = await loginAsClientRep(app, ids.x, 'client_manager');
    repX2 = await loginAsClientRep(app, ids.x, 'client_manager');
    repY = await loginAsClientRep(app, ids.y, 'client_manager');
    me = await loginAsEmployee(app, ids.a);
    colleague = await loginAsEmployee(app, ids.b);
    // Requests the two employees raised themselves.
    req.mine = await mkReq(ids.x, 'raised by a', 2, {
      createdByUserId: me.userId,
      requesterEmployeeId: ids.a,
    });
    req.colleagues = await mkReq(ids.x, 'raised by b', -1, {
      createdByUserId: colleague.userId,
      requesterEmployeeId: ids.b,
    });
    await flag(ids.x, 'flag.client-self-service', true);
    await flag(ids.x, 'flag.employee-self-service', true);
  });

  async function cleanup(): Promise<void> {
    const cos = (
      await owner.client.findMany({ where: { nameEn: { startsWith: MARK } }, select: { id: true } })
    ).map((c) => c.id);
    const people = (
      await owner.employee.findMany({ where: { clientId: { in: cos } }, select: { id: true } })
    ).map((e) => e.id);
    await owner.dependant.deleteMany({ where: { employeeId: { in: people } } });
    await owner.groProcess.deleteMany({ where: { clientId: { in: cos } } });
    await owner.task.deleteMany({ where: { clientId: { in: cos } } });
    await owner.request.deleteMany({ where: { clientId: { in: cos } } });
    await owner.clientSetting.deleteMany({ where: { clientId: { in: cos } } });
    await owner.auditEntry.deleteMany({ where: { clientId: { in: cos } } });
    await owner.employee.deleteMany({ where: { id: { in: people } } });
    await owner.client.deleteMany({ where: { id: { in: cos } } });
  }

  afterAll(async () => {
    for (const who of [repX, repX2, repY, me, colleague]) {
      await owner.escalationRead.deleteMany({ where: { userId: who.userId } });
    }
    await cleanupHelperUsers(app);
    await cleanup();
    await owner.$disconnect();
    await app.close();
  });

  // ---- the client manager ----

  it('a client manager is told what has LAPSED or breached at their own company — and only that', async () => {
    const l = await ladderOf('/escalations', repX);
    expect(keys(l)).toEqual(
      [
        `expiry:${ids.a}:iqama`, // lapsed
        `expiry:${ids.b}:contract`, // lapsed
        `request:${req.lateX}`, // past its service level
        `request:${req.colleagues}`, // raised by an employee of theirs, also past it
      ].sort(),
    );
    // Not there: anything below Breach (a's permit, passport, contract; the
    // request due tomorrow), the leaver, b's permit (being renewed), the two
    // dependants, the procedure and the task — and nothing of company Y.
    expect(l.items.every((i) => i.stage === 'breach' && i.client?.id === ids.x)).toBe(true);
    expect(l.suppressed).toBe(1); // b's lapsed permit
    expect(JSON.stringify(l)).not.toContain(ids.y);
    expect(JSON.stringify(l)).not.toContain(ids.other);
    expect(JSON.stringify(l)).not.toContain(ids.depA);
  });

  it('shows a client no member of staff: no owner, no name, no account id', async () => {
    const l = await ladderOf('/escalations', repX);
    for (const i of l.items)
      expect(i).toMatchObject({ owner: null, mine: false, told: true, read: false });
    const body = JSON.stringify(l);
    expect(body).not.toContain('Turki Test'); // the company's named officer
    expect(body).not.toContain(officer.userId);
    expect(body).not.toContain(hr.userId); // the late request's assignee
  });

  it("another company's manager sees their own breaches, never X's", async () => {
    await flag(ids.y, 'flag.client-self-service', true);
    const l = await ladderOf('/escalations', repY);
    expect(keys(l)).toEqual([`expiry:${ids.other}:iqama`, `request:${req.lateY}`].sort());
    expect(JSON.stringify(l)).not.toContain(ids.x);
  });

  it('with the portal off, a client sees no person at all — their requests still', async () => {
    await flag(ids.x, 'flag.client-self-service', false);
    try {
      const l = await ladderOf('/escalations', repX);
      expect(keys(l)).toEqual([`request:${req.lateX}`, `request:${req.colleagues}`].sort());
      expect(l.suppressed).toBe(0); // nothing about people is counted either
      expect(JSON.stringify(l)).not.toContain(ids.a);
    } finally {
      await flag(ids.x, 'flag.client-self-service', true);
    }
  });

  it("a client manager's count and read marks are their own", async () => {
    const count = async (who: TestPrincipal) =>
      (await get('/escalations/count', who).expect(200)).body.needsAction as number;
    expect(await count(repX)).toBe(4);
    const res = await http()
      .post('/escalations/read')
      .set('Cookie', repX.cookie)
      // Their own lapsed iqama; a staff-only item; another company's breach.
      .send({
        keys: [`expiry:${ids.a}:iqama`, `expiry:${ids.a}:passport`, `expiry:${ids.other}:iqama`],
      })
      .expect(200);
    expect(res.body).toEqual({ marked: 1 });
    expect(await count(repX)).toBe(3);
    expect(await count(repX2)).toBe(4); // a colleague at the same company has not read it
    const marks = await owner.escalationRead.findMany({ where: { userId: repX.userId } });
    expect(marks.map((m) => m.itemKey)).toEqual([`expiry:${ids.a}:iqama`]);
  });

  // ---- the employee ----

  it('an employee sees every stage of their own documents, their dependant’s and their own request', async () => {
    const l = await ladderOf('/me/escalations', me);
    expect(l.items.map((i) => [i.key, i.stage])).toEqual([
      [`expiry:${ids.a}:iqama`, 'breach'],
      [`dependant:${ids.depA}:iqama`, 'breach'],
      [`expiry:${ids.a}:work_permit`, 'escalation'],
      [`request:${req.mine}`, 'reminder'],
      [`expiry:${ids.a}:passport`, 'reminder'],
      [`expiry:${ids.a}:contract`, 'notice'],
    ]);
    for (const i of l.items) expect(i).toMatchObject({ owner: null, mine: true, told: true });
    expect(Object.keys(l).sort()).toEqual(['items', 'suppressed', 'thresholds', 'today']);
  });

  it('nothing of a colleague, the company’s other requests, a procedure, a task or a member of staff', async () => {
    const body = JSON.stringify(await ladderOf('/me/escalations', me));
    for (const hidden of [
      ids.b,
      ids.depB,
      req.colleagues, // a colleague's request
      req.lateX, // the company's request, raised by staff
      'Turki Test',
      officer.userId,
      `${MARK} task`,
    ]) {
      expect(body, hidden).not.toContain(hidden);
    }
    expect(body).not.toContain('procedure:');
    expect(body).not.toContain('task:');
  });

  it('a colleague sees their own — and their permit, being renewed, stays quiet', async () => {
    const l = await ladderOf('/me/escalations', colleague);
    expect(keys(l)).toEqual(
      [
        `expiry:${ids.b}:contract`,
        `dependant:${ids.depB}:iqama`,
        `request:${req.colleagues}`,
      ].sort(),
    );
    expect(l.suppressed).toBe(1);
    expect(JSON.stringify(l)).not.toContain(ids.a);
  });

  it("an employee's count and read marks are their own, and only for what they are shown", async () => {
    const count = async (who: TestPrincipal) =>
      (await get('/me/escalations/count', who).expect(200)).body.needsAction as number;
    expect(await count(me)).toBe(3); // iqama + dependant at Breach, permit at Escalated
    const res = await http()
      .post('/me/escalations/read')
      .set('Cookie', me.cookie)
      .send({ keys: [`expiry:${ids.a}:iqama`, `expiry:${ids.b}:contract`, `request:${req.lateX}`] })
      .expect(200);
    expect(res.body).toEqual({ marked: 1 });
    expect(await count(me)).toBe(2);
    const l = await ladderOf('/me/escalations', me);
    expect(l.items.find((i: EscalationItem) => i.key === `expiry:${ids.a}:iqama`)?.read).toBe(true);
    // The client manager, told about the same lapsed iqama, has their own mark for it.
    const marks = await owner.escalationRead.findMany({ where: { userId: me.userId } });
    expect(marks.map((m) => m.itemKey)).toEqual([`expiry:${ids.a}:iqama`]);
    await http()
      .post('/me/escalations/read')
      .set('Cookie', me.cookie)
      .send({ key: 'x' })
      .expect(400);
  });

  it('with self-service off for the company, an employee gets nothing', async () => {
    await flag(ids.x, 'flag.employee-self-service', false);
    try {
      await get('/me/escalations', me).expect(403);
      await get('/me/escalations/count', me).expect(403);
      await http()
        .post('/me/escalations/read')
        .set('Cookie', me.cookie)
        .send({ keys: [] })
        .expect(403);
    } finally {
      await flag(ids.x, 'flag.employee-self-service', true);
    }
  });

  it('who: /me is for employees only; staff and clients use /escalations', async () => {
    for (const who of [hr, repX]) {
      await get('/me/escalations', who).expect(403);
      await get('/me/escalations/count', who).expect(403);
    }
    await http().get('/me/escalations').expect(401);
    await http().post('/me/escalations/read').send({ keys: [] }).expect(401);
    await get('/escalations', me).expect(403);
  });
});
