import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { EICAR_TEST_SIGNATURE } from '../src/modules/storage/public-api';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEmployee,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// THREAD-03 (ADR-016 rev. 2): "Ask for more detail". Staff with request.process
// move an open or in-progress request to `info_needed` WITH a note (posted to the
// thread); the requester's side (the client manager, or the employee who raised
// it) replying with a comment or a CONFIRMED file returns it to where it was —
// open, or in progress with its assignee. Staff comments never return it. The
// database holds the "where it was" and refuses any other way out for the
// client and employee roles.
const MARK = 'THREAD-03-test';
const PDF = Buffer.from('%PDF-1.4\n% detail\n%%EOF\n');

describe('Ask for more detail (THREAD-03, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let staffDb: PrismaClient;
  let clientDb: PrismaClient;
  let empDb: PrismaClient;
  const co = { x: '', y: '' };
  const emp = { me: '', colleague: '' };
  let hr: TestPrincipal;
  let gro: TestPrincipal;
  let auditor: TestPrincipal;
  let managerX: TestPrincipal;
  let me: TestPrincipal & { employeeId: string };
  let colleague: TestPrincipal & { employeeId: string };

  const http = () => request(app.getHttpServer());
  const statusOf = async (id: string) => (await owner.request.findUniqueOrThrow({ where: { id } })).status;
  const ask = (who: TestPrincipal, id: string, note?: string) =>
    http()
      .post(`/requests/${id}/process`)
      .set('Cookie', who.cookie)
      .send(note === undefined ? { status: 'info_needed' } : { status: 'info_needed', note });
  const comment = (who: TestPrincipal, id: string, body: string, self = false) =>
    http()
      .post(self ? `/me/requests/${id}/comments` : `/requests/${id}/comments`)
      .set('Cookie', who.cookie)
      .send({ body });
  const mk = (title: string, extra: object = {}) =>
    owner.request.create({
      data: { clientId: co.x, type: 'letter', title: `${MARK} ${title}`, createdByUserId: managerX.userId, ...extra },
    });
  const asked = (userId: string) =>
    owner.notification.count({ where: { recipientUserId: userId, titleEn: 'More detail needed on your request' } });

  async function attach(who: TestPrincipal, base: string, bytes: Buffer): Promise<string> {
    const issued = await http()
      .post(`${base}/attachments`)
      .set('Cookie', who.cookie)
      .send({ fileName: 'detail.pdf', contentType: 'application/pdf', sizeBytes: bytes.length })
      .expect(201);
    await fetch(issued.body.upload.url, { method: 'PUT', headers: issued.body.upload.headers, body: bytes });
    const done = await http().post(`${base}/attachments/${issued.body.attachment.id}/confirm`).set('Cookie', who.cookie).expect(200);
    return done.body.status as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    const db = (url?: string) => new PrismaClient({ adapter: new PrismaPg({ connectionString: url ?? '' }) });
    owner = db(process.env.DATABASE_URL);
    staffDb = db(process.env.STAFF_DATABASE_URL);
    clientDb = db(process.env.CLIENT_DATABASE_URL);
    empDb = db(process.env.EMPLOYEE_DATABASE_URL);

    co.x = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} X` } })).id;
    co.y = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} Y` } })).id;
    await owner.clientSetting.create({ data: { clientId: co.x, key: 'flag.employee-self-service', value: true } });
    const person = async (name: string) =>
      (
        await owner.employee.create({
          data: { clientId: co.x, nameAr: 'موظف', nameEn: `${MARK} ${name}`, nationality: 'EG', contractType: 'unlimited' },
        })
      ).id;
    emp.me = await person('me');
    emp.colleague = await person('colleague');

    hr = await loginAsStaff(app, 'hr_officer');
    gro = await loginAsStaff(app, 'gro_officer');
    auditor = await loginAsEnrolledStaff(app, 'auditor');
    managerX = await loginAsClientRep(app, co.x);
    me = await loginAsEmployee(app, emp.me);
    colleague = await loginAsEmployee(app, emp.colleague);
  });

  afterAll(async () => {
    const companies = { in: [co.x, co.y] };
    await owner.requestAttachment.deleteMany({ where: { clientId: companies } });
    await owner.requestComment.deleteMany({ where: { clientId: companies } });
    const ids = (await owner.request.findMany({ where: { clientId: companies }, select: { id: true } })).map((r) => r.id);
    await owner.task.deleteMany({ where: { requestId: { in: ids } } });
    await owner.request.deleteMany({ where: { clientId: companies } });
    // Every notification these test-only accounts received is this spec's.
    await owner.notification.deleteMany({
      where: { recipientUserId: { in: [hr.userId, gro.userId, managerX.userId, me.userId, colleague.userId] } },
    });
    await cleanupHelperUsers(app);
    await owner.employee.deleteMany({ where: { clientId: companies } });
    await owner.clientSetting.deleteMany({ where: { clientId: companies } });
    await owner.client.deleteMany({ where: { id: companies } });
    for (const c of [owner, staffDb, clientDb, empDb]) await c.$disconnect();
    await app.close();
  });

  describe('through the API', () => {
    it('staff ask with a note: info_needed, the note is posted to the thread, the requester is told', async () => {
      const r = await mk('open request');
      const before = await asked(managerX.userId);
      const res = await ask(hr, r.id, '  Which bank should the letter be addressed to?  ').expect(200);
      expect(res.body.status).toBe('info_needed');
      const thread = await http().get(`/requests/${r.id}/comments`).set('Cookie', managerX.cookie).expect(200);
      expect(thread.body.comments.map((c: { body: string }) => c.body)).toEqual(['Which bank should the letter be addressed to?']);
      expect(thread.body.comments[0].author.kind).toBe('staff');
      expect(await asked(managerX.userId)).toBe(before + 1);
    });

    it('asking needs a note', async () => {
      const r = await mk('no note');
      await ask(hr, r.id).expect(400);
      await ask(hr, r.id, '   ').expect(400);
      await ask(hr, r.id, 'x'.repeat(4001)).expect(400);
      expect(await statusOf(r.id)).toBe('open');
    });

    it('only request.process holders ask — not the client manager, not the Auditor', async () => {
      const r = await mk('who asks');
      await ask(managerX, r.id, 'please').expect(403);
      await ask(auditor, r.id, 'please').expect(403);
      expect(await statusOf(r.id)).toBe('open');
    });

    it('the client manager’s reply returns an in-progress request to in progress, assignee kept', async () => {
      const r = await mk('in progress', { status: 'in_progress', assigneeUserId: hr.userId });
      await ask(hr, r.id, 'Need the stamped form.').expect(200);
      await comment(managerX, r.id, 'Attached the stamped form.').expect(201);
      const after = await owner.request.findUniqueOrThrow({ where: { id: r.id } });
      expect(after).toMatchObject({ status: 'in_progress', assigneeUserId: hr.userId, infoReturnsTo: null });
    });

    it('a confirmed file from the requester returns it; a refused one does not', async () => {
      const r = await mk('file reply');
      await ask(hr, r.id, 'Send the passport copy.').expect(200);
      expect(await attach(managerX, `/requests/${r.id}`, Buffer.from(EICAR_TEST_SIGNATURE))).toBe('quarantined');
      expect(await statusOf(r.id)).toBe('info_needed');
      expect(await attach(managerX, `/requests/${r.id}`, PDF)).toBe('available');
      expect(await statusOf(r.id)).toBe('open');
    });

    it('staff comments and staff files never return it', async () => {
      const r = await mk('staff reply');
      await ask(hr, r.id, 'Which branch?').expect(200);
      await comment(gro, r.id, 'Reminder: we still need the branch.').expect(201);
      expect(await attach(hr, `/requests/${r.id}`, PDF)).toBe('available');
      expect(await statusOf(r.id)).toBe('info_needed');
    });

    it('on an employee-raised request, the employee’s reply returns it — and so does their client manager’s', async () => {
      const mine = await mk('raised by me', { createdByUserId: me.userId, requesterEmployeeId: emp.me });
      await ask(hr, mine.id, 'Which embassy?').expect(200);
      await comment(me, mine.id, 'The Egyptian embassy.', true).expect(201);
      expect(await statusOf(mine.id)).toBe('open');

      const viaManager = await mk('raised by me, answered by my manager', { createdByUserId: me.userId, requesterEmployeeId: emp.me });
      await ask(hr, viaManager.id, 'Which embassy?').expect(200);
      await comment(managerX, viaManager.id, 'Egyptian embassy, Riyadh.').expect(201);
      expect(await statusOf(viaManager.id)).toBe('open');
    });

    it('the employee who raised it is told when detail is asked', async () => {
      const mine = await mk('tell me', { createdByUserId: me.userId, requesterEmployeeId: emp.me });
      const before = await asked(me.userId);
      await ask(hr, mine.id, 'Which bank?').expect(200);
      expect(await asked(me.userId)).toBe(before + 1);
    });

    it('the legal moves: ask from open or in progress only; staff may move it on by hand to open, in progress or cancelled', async () => {
      const resolved = await mk('resolved', { status: 'resolved' });
      await ask(hr, resolved.id, 'late question').expect(400);
      const r = await mk('by hand');
      await ask(hr, r.id, 'Which bank?').expect(200);
      await http().post(`/requests/${r.id}/process`).set('Cookie', hr.cookie).send({ status: 'resolved' }).expect(400);
      await http().post(`/requests/${r.id}/process`).set('Cookie', hr.cookie).send({ status: 'in_progress' }).expect(200);
      expect(await owner.request.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ status: 'in_progress', infoReturnsTo: null });
      const c = await mk('cancel it');
      await ask(hr, c.id, 'Still needed?').expect(200);
      await http().post(`/requests/${c.id}/process`).set('Cookie', hr.cookie).send({ status: 'cancelled' }).expect(200);
      // A note is only for asking.
      await http().post(`/requests/${resolved.id}/process`).set('Cookie', hr.cookie).send({ status: 'closed', note: 'x' }).expect(400);
    });

    it('the decision trail records the ask and the reply that returned it', async () => {
      const r = await mk('trail');
      await ask(hr, r.id, 'Which bank?').expect(200);
      await comment(managerX, r.id, 'Al Rajhi.').expect(201);
      const trail = await http().get(`/requests/${r.id}/history`).set('Cookie', hr.cookie).expect(200);
      const actions = trail.body.entries.map((e: { action: string }) => e.action);
      expect(actions).toContain('ask-info');
      expect(actions).toContain('info-returned');
    });

    it('info_needed filters, and counts as active work on the calendar', async () => {
      const due = new Date(Date.now() + 3 * 86400000);
      const r = await mk('calendar', { dueDate: due });
      await ask(hr, r.id, 'Which bank?').expect(200);
      const listed = await http().get('/requests').query({ status: 'info_needed', clientId: co.x }).set('Cookie', hr.cookie).expect(200);
      expect(listed.body.requests.map((q: { id: string }) => q.id)).toContain(r.id);
      expect(listed.body.requests.every((q: { status: string }) => q.status === 'info_needed')).toBe(true);
      const from = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const to = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
      const view = await http().get('/calendar/view').query({ from, to }).set('Cookie', hr.cookie).expect(200);
      expect(JSON.stringify(view.body)).toContain(r.id);
    });

    it('the Service operations report counts it in its own column, not as done', async () => {
      const r = await mk('report');
      await ask(hr, r.id, 'Which bank?').expect(200);
      const admin = await loginAsEnrolledStaff(app, 'administrator');
      const rep = await http().get('/reports/service-operations').set('Cookie', admin.cookie).expect(200);
      expect(rep.body.columns.map((c: { key: string }) => c.key)).toContain('reqInfoNeeded');
      const row = rep.body.rows.find((x: Record<string, unknown>) => x.client === `${MARK} X`);
      expect(row.reqInfoNeeded).toBeGreaterThanOrEqual(1);
    });
  });

  describe('the database fence', () => {
    const asClientX = <T>(fn: (tx: PrismaClient) => Promise<T>) =>
      clientDb.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.client_id', ${co.x}, true)`;
        return fn(tx as unknown as PrismaClient);
      });
    const asMe = <T>(fn: (tx: PrismaClient) => Promise<T>) =>
      empDb.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.employee_id', ${emp.me}, true)`;
        return fn(tx as unknown as PrismaClient);
      });
    const waiting = async (extra: object = {}) => {
      const r = await mk('fence', {
        status: 'info_needed',
        infoReturnsTo: 'in_progress',
        infoNeededSince: new Date(), // THREAD-04: the wait's start travels with the status
        assigneeUserId: hr.userId,
        ...extra,
      });
      return r.id;
    };

    it('the requester’s side leaves info_needed only to where it was', async () => {
      const id = await waiting();
      await expect(asClientX((tx) => tx.request.update({ where: { id }, data: { status: 'resolved', infoReturnsTo: null, infoNeededSince: null } }))).rejects.toThrow();
      await expect(asClientX((tx) => tx.request.update({ where: { id }, data: { status: 'open', infoReturnsTo: null, infoNeededSince: null } }))).rejects.toThrow();
      await asClientX((tx) => tx.request.update({ where: { id }, data: { status: 'in_progress', infoReturnsTo: null, infoNeededSince: null } }));
      expect(await statusOf(id)).toBe('in_progress');
    });

    it('an employee may return only a request they raised, and only to where it was', async () => {
      const mine = await waiting({ createdByUserId: me.userId, requesterEmployeeId: emp.me });
      const theirs = await waiting({ createdByUserId: colleague.userId, requesterEmployeeId: emp.colleague });
      await expect(asMe((tx) => tx.request.update({ where: { id: mine }, data: { status: 'cancelled', infoReturnsTo: null, infoNeededSince: null } }))).rejects.toThrow();
      await expect(asMe((tx) => tx.request.update({ where: { id: mine }, data: { title: 'renamed' } }))).rejects.toThrow();
      const moved = await asMe((tx) => tx.request.updateMany({ where: { id: theirs }, data: { status: 'in_progress', infoReturnsTo: null, infoNeededSince: null } }));
      expect(moved.count).toBe(0);
      expect(await statusOf(theirs)).toBe('info_needed');
      await asMe((tx) => tx.request.update({ where: { id: mine }, data: { status: 'in_progress', infoReturnsTo: null, infoNeededSince: null } }));
      expect(await statusOf(mine)).toBe('in_progress');
    });

    it('entering info_needed records where it was — for staff too — and the two always travel together', async () => {
      const r = await mk('enter');
      await expect(staffDb.request.update({ where: { id: r.id }, data: { status: 'info_needed', infoReturnsTo: 'in_progress', infoNeededSince: new Date() } })).rejects.toThrow();
      await expect(staffDb.request.update({ where: { id: r.id }, data: { status: 'info_needed', infoNeededSince: new Date() } })).rejects.toThrow();
      await expect(staffDb.request.update({ where: { id: r.id }, data: { infoReturnsTo: 'open' } })).rejects.toThrow();
      const resolved = await mk('enter from resolved', { status: 'resolved' });
      await expect(
        staffDb.request.update({ where: { id: resolved.id }, data: { status: 'info_needed', infoReturnsTo: 'resolved', infoNeededSince: new Date() } }),
      ).rejects.toThrow();
      await staffDb.request.update({ where: { id: r.id }, data: { status: 'info_needed', infoReturnsTo: 'open', infoNeededSince: new Date() } });
      expect(await statusOf(r.id)).toBe('info_needed');
    });
  });
});
