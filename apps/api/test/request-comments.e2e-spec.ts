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

// THREAD-01 (ADR-016): comments on a request's thread. Two layers, both proven:
// the API per role (who reads, who posts, who is told) and the DATABASE fence on
// raw role connections (a client manager or employee can't write onto someone
// else's request, and nobody — staff included — edits or deletes a comment).
const MARK = 'THREAD-01-test';

describe('Request comments (THREAD-01, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let staffDb: PrismaClient;
  let clientDb: PrismaClient;
  let empDb: PrismaClient;
  const co = { x: '', y: '' };
  const emp = { me: '', colleague: '' };
  const req = { x: '', y: '', mine: '', colleague: '' };
  let hr: TestPrincipal;
  let gro: TestPrincipal;
  let auditor: TestPrincipal;
  let managerX: TestPrincipal;
  let me: TestPrincipal & { employeeId: string };

  const http = () => request(app.getHttpServer());
  const post = (who: TestPrincipal, path: string, body: string) =>
    http().post(path).set('Cookie', who.cookie).send({ body });
  const notified = (userId: string) =>
    owner.notification.count({ where: { recipientUserId: userId, category: 'request', titleEn: 'New comment on a request' } });

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
    const colleague = await loginAsEmployee(app, emp.colleague);

    const mk = (clientId: string, createdByUserId: string, title: string, requesterEmployeeId: string | null = null) =>
      owner.request.create({ data: { clientId, type: 'letter', title: `${MARK} ${title}`, createdByUserId, requesterEmployeeId } });
    req.x = (await mk(co.x, managerX.userId, 'raised by the manager')).id;
    req.y = (await mk(co.y, hr.userId, 'other company')).id;
    req.mine = (await mk(co.x, me.userId, 'raised by me', emp.me)).id;
    req.colleague = (await mk(co.x, colleague.userId, 'raised by a colleague', emp.colleague)).id;
  });

  afterAll(async () => {
    const companies = { in: [co.x, co.y] };
    await owner.requestComment.deleteMany({ where: { clientId: companies } });
    await owner.request.deleteMany({ where: { clientId: companies } });
    await owner.notification.deleteMany({ where: { titleEn: 'New comment on a request', recipientUserId: { in: [hr.userId, managerX.userId, me.userId] } } });
    await cleanupHelperUsers(app);
    await owner.employee.deleteMany({ where: { clientId: companies } });
    await owner.clientSetting.deleteMany({ where: { clientId: companies } });
    await owner.client.deleteMany({ where: { id: companies } });
    for (const c of [owner, staffDb, clientDb, empDb]) await c.$disconnect();
    await app.close();
  });

  describe('through the API', () => {
    it('staff post; the comment names its author (no email) and the requester is told', async () => {
      const before = await notified(managerX.userId);
      const res = await post(hr, `/requests/${req.x}/comments`, '  Please send the bank template.  ').expect(201);
      expect(res.body).toMatchObject({ body: 'Please send the bank template.', author: { kind: 'staff' }, mine: true });
      expect(Object.keys(res.body.author).sort()).toEqual(['kind', 'name']);
      expect(await notified(managerX.userId)).toBe(before + 1);
    });

    it('the client manager reads and replies; the assignee is told, not the author', async () => {
      await owner.request.update({ where: { id: req.x }, data: { assigneeUserId: hr.userId } });
      const hrBefore = await notified(hr.userId);
      const mgrBefore = await notified(managerX.userId);
      await post(managerX, `/requests/${req.x}/comments`, 'Attached shortly.').expect(201);
      expect(await notified(hr.userId)).toBe(hrBefore + 1);
      expect(await notified(managerX.userId)).toBe(mgrBefore);
      const list = await http().get(`/requests/${req.x}/comments`).set('Cookie', managerX.cookie).expect(200);
      expect(list.body.comments.map((c: { body: string }) => c.body)).toEqual([
        'Please send the bank template.',
        'Attached shortly.',
      ]);
      expect(list.body.comments.map((c: { mine: boolean }) => c.mine)).toEqual([false, true]);
    });

    it('another company’s request is 404 to a client manager — read or write', async () => {
      await http().get(`/requests/${req.y}/comments`).set('Cookie', managerX.cookie).expect(404);
      await post(managerX, `/requests/${req.y}/comments`, 'hello').expect(404);
    });

    it('the Auditor reads the thread but cannot post; GRO can', async () => {
      await http().get(`/requests/${req.x}/comments`).set('Cookie', auditor.cookie).expect(200);
      await post(auditor, `/requests/${req.x}/comments`, 'note').expect(403);
      await post(gro, `/requests/${req.x}/comments`, 'Absher appointment booked.').expect(201);
    });

    it('a comment needs 1 to 4000 characters', async () => {
      await post(hr, `/requests/${req.x}/comments`, '   ').expect(400);
      await post(hr, `/requests/${req.x}/comments`, 'x'.repeat(4001)).expect(400);
      await http().post(`/requests/${req.x}/comments`).set('Cookie', hr.cookie).send({ body: 'ok', extra: 1 }).expect(400);
    });

    it('the employee opens a request they raised and its thread; a colleague’s is 404', async () => {
      await http().get(`/me/requests/${req.mine}`).set('Cookie', me.cookie).expect(200);
      await http().get(`/me/requests/${req.colleague}`).set('Cookie', me.cookie).expect(404);
      const added = await post(me, `/me/requests/${req.mine}/comments`, 'Here is my passport copy.').expect(201);
      expect(added.body).toMatchObject({ author: { kind: 'employee' }, mine: true });
      await post(me, `/me/requests/${req.colleague}/comments`, 'nosy').expect(404);
      await http().get(`/me/requests/${req.colleague}/comments`).set('Cookie', me.cookie).expect(404);
      // The client manager sees the employee's comment (ADR-011: reps see employee-raised requests).
      const seen = await http().get(`/requests/${req.mine}/comments`).set('Cookie', managerX.cookie).expect(200);
      expect(seen.body.comments.map((c: { body: string }) => c.body)).toContain('Here is my passport copy.');
      // …and the staff routes stay closed to the employee.
      await http().get(`/requests/${req.mine}/comments`).set('Cookie', me.cookie).expect(403);
    });

    it('every comment is audited as request-comment', async () => {
      const n = await owner.auditEntry.count({ where: { resource: 'request-comment', action: 'create', clientId: co.x } });
      expect(n).toBeGreaterThanOrEqual(4);
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
    const row = (requestId: string, extra: object = {}) => ({
      requestId,
      clientId: co.x,
      requesterEmployeeId: null as string | null,
      authorUserId: managerX.userId,
      body: 'forged',
      ...extra,
    });

    it('a client manager cannot write onto another company’s request, or copy the requester wrongly', async () => {
      await expect(asClientX((tx) => tx.requestComment.create({ data: row(req.y) }))).rejects.toThrow();
      await expect(
        asClientX((tx) => tx.requestComment.create({ data: row(req.mine, { requesterEmployeeId: null }) })),
      ).rejects.toThrow();
    });

    it('an employee cannot write onto a colleague’s request, and sees no other thread', async () => {
      await expect(
        asMe((tx) => tx.requestComment.create({ data: row(req.colleague, { requesterEmployeeId: emp.colleague, authorUserId: me.userId }) })),
      ).rejects.toThrow();
      // The harder forgery: onto a colleague's request but labelled with MY id —
      // the read policy would let this row back out, so only employee_comment's
      // "the request must be one I raised" stops it.
      await expect(
        asMe((tx) => tx.requestComment.create({ data: row(req.colleague, { requesterEmployeeId: emp.me, authorUserId: me.userId }) })),
      ).rejects.toThrow();
      const seen = await asMe((tx) => tx.requestComment.findMany({ select: { requesterEmployeeId: true } }));
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.every((c) => c.requesterEmployeeId === emp.me)).toBe(true);
    });

    it('nobody edits or deletes a comment — staff included', async () => {
      const any = await owner.requestComment.findFirstOrThrow({ where: { requestId: req.x } });
      await expect(staffDb.requestComment.update({ where: { id: any.id }, data: { body: 'rewritten' } })).rejects.toThrow();
      await expect(staffDb.requestComment.delete({ where: { id: any.id } })).rejects.toThrow();
      await expect(
        asClientX((tx) => tx.requestComment.update({ where: { id: any.id }, data: { body: 'rewritten' } })),
      ).rejects.toThrow();
      expect((await owner.requestComment.findUniqueOrThrow({ where: { id: any.id } })).body).toBe(any.body);
    });
  });
});
