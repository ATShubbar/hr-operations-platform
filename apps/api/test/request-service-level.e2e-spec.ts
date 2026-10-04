import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addWorkingDays, dayIn, workingDaysBetween } from '@hr/dates';
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

// THREAD-04 (ADR-016): a service level per request type, in WORKING days of the
// company's week. A new request's due date comes from its type unless staff set
// one; the clock pauses while the request waits on its requester (info_needed) —
// on the way out its due date moves by the paused working days. The arithmetic
// itself is unit-tested in @hr/dates; this spec proves the wiring per path.
const MARK = 'THREAD-04-test';
const TZ = 'Asia/Riyadh';
const SUN_THU = [0, 1, 2, 3, 4];
const MON_FRI = [1, 2, 3, 4, 5];
const DEFAULTS = { letter: 2, certificate: 2, document: 3, gro_service: 5, general: 1 };
const KEY = 'request.service-level-days';
const iso = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const expectedDue = (days: number, week = SUN_THU, at = new Date()) =>
  iso(addWorkingDays(dayIn(at, TZ), days, week));

describe('Service level per request type (THREAD-04, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  const co = { x: '', mf: '' };
  let empMe = '';
  let hr: TestPrincipal;
  let admin: TestPrincipal;
  let managerX: TestPrincipal;
  let managerMf: TestPrincipal;
  let me: TestPrincipal & { employeeId: string };
  let savedSetting: unknown = undefined;

  const http = () => request(app.getHttpServer());
  const dueOf = async (id: string) => iso((await owner.request.findUniqueOrThrow({ where: { id } })).dueDate);
  const raise = (who: TestPrincipal, body: object) =>
    http().post('/requests').set('Cookie', who.cookie).send({ type: 'letter', title: `${MARK} raised`, ...body });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });
    // The setting starts at its defaults for this spec (and is put back after).
    savedSetting = (await owner.systemSetting.findUnique({ where: { key: KEY } }))?.value;
    await owner.systemSetting.deleteMany({ where: { key: KEY } });

    co.x = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} X` } })).id;
    co.mf = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} Mon-Fri` } })).id;
    await owner.clientSetting.createMany({
      data: [
        { clientId: co.x, key: 'flag.employee-self-service', value: true },
        { clientId: co.mf, key: 'working.week', value: MON_FRI },
      ],
    });
    empMe = (
      await owner.employee.create({
        data: { clientId: co.x, nameAr: 'موظف', nameEn: `${MARK} me`, nationality: 'EG', contractType: 'unlimited' },
      })
    ).id;

    hr = await loginAsStaff(app, 'hr_officer');
    admin = await loginAsEnrolledStaff(app, 'administrator');
    managerX = await loginAsClientRep(app, co.x);
    managerMf = await loginAsClientRep(app, co.mf);
    me = await loginAsEmployee(app, empMe);
  });

  afterAll(async () => {
    const companies = { in: [co.x, co.mf] };
    await owner.requestComment.deleteMany({ where: { clientId: companies } });
    const ids = (await owner.request.findMany({ where: { clientId: companies }, select: { id: true } })).map((r) => r.id);
    await owner.task.deleteMany({ where: { requestId: { in: ids } } });
    await owner.request.deleteMany({ where: { clientId: companies } });
    await owner.notification.deleteMany({ where: { recipientUserId: { in: [hr.userId, managerX.userId, managerMf.userId, me.userId] } } });
    await cleanupHelperUsers(app);
    await owner.employee.deleteMany({ where: { clientId: companies } });
    await owner.clientSetting.deleteMany({ where: { clientId: companies } });
    await owner.client.deleteMany({ where: { id: companies } });
    await owner.systemSetting.deleteMany({ where: { key: KEY } });
    if (savedSetting !== undefined) {
      await owner.systemSetting.create({ data: { key: KEY, value: savedSetting as never } });
    }
    await owner.$disconnect();
    await app.close();
  });

  describe('a new request gets its due date from its type', () => {
    it('staff path: letter → 2 working days; general → 1; the response names the service level', async () => {
      const letter = await raise(hr, { clientId: co.x }).expect(201);
      expect(iso(letter.body.dueDate)).toBe(expectedDue(DEFAULTS.letter));
      expect(letter.body.serviceLevelDays).toBe(2);
      const general = await raise(hr, { clientId: co.x, type: 'general' }).expect(201);
      expect(iso(general.body.dueDate)).toBe(expectedDue(DEFAULTS.general));
    });

    it('a due date staff set by hand wins', async () => {
      const res = await raise(hr, { clientId: co.x, dueDate: '2027-01-14' }).expect(201);
      expect(iso(res.body.dueDate)).toBe('2027-01-14');
    });

    it('client path, in the company’s OWN working week (Mon–Fri override)', async () => {
      const x = await raise(managerX, { type: 'gro_service' }).expect(201);
      expect(iso(x.body.dueDate)).toBe(expectedDue(DEFAULTS.gro_service));
      const mf = await raise(managerMf, { type: 'gro_service' }).expect(201);
      expect(iso(mf.body.dueDate)).toBe(expectedDue(DEFAULTS.gro_service, MON_FRI));
    });

    it('employee path: the system sets it (the employee can’t choose one)', async () => {
      const res = await http()
        .post('/me/requests')
        .set('Cookie', me.cookie)
        .send({ type: 'certificate', title: `${MARK} employee` })
        .expect(201);
      expect(await dueOf(res.body.id)).toBe(expectedDue(DEFAULTS.certificate));
      const back = await http().get(`/me/requests/${res.body.id}`).set('Cookie', me.cookie).expect(200);
      expect(back.body.serviceLevelDays).toBe(DEFAULTS.certificate);
    });

    it('the Administrator changes the days in Settings and new requests follow; bad values are refused', async () => {
      const patch = (value: unknown) =>
        http().patch(`/config/system/${KEY}`).set('Cookie', admin.cookie).send({ value });
      await patch({ ...DEFAULTS, letter: 0 }).expect(400);
      await patch({ letter: 2 }).expect(400);
      await patch({ ...DEFAULTS, letter: 7 }).expect(200);
      const res = await raise(hr, { clientId: co.x }).expect(201);
      expect(iso(res.body.dueDate)).toBe(expectedDue(7));
      expect(res.body.serviceLevelDays).toBe(7);
      await patch(DEFAULTS).expect(200);
    });
  });

  describe('the clock pauses while waiting on the requester', () => {
    // A request that has been waiting since `daysAgo` calendar days before now.
    async function waitingSince(daysAgo: number, due: string | null, clientId = co.x) {
      const r = await owner.request.create({
        data: {
          clientId,
          type: 'letter',
          title: `${MARK} waiting`,
          createdByUserId: managerX.userId,
          dueDate: due ? new Date(`${due}T00:00:00Z`) : null,
        },
      });
      await http().post(`/requests/${r.id}/process`).set('Cookie', hr.cookie).send({ status: 'info_needed', note: 'Which bank?' }).expect(200);
      const since = new Date(Date.now() - daysAgo * 86_400_000);
      await owner.request.update({ where: { id: r.id }, data: { infoNeededSince: since } });
      return { id: r.id, since };
    }
    const paused = (since: Date, week = SUN_THU) => workingDaysBetween(dayIn(since, TZ), dayIn(new Date(), TZ), week);

    it('asking records when the wait began', async () => {
      const r = await owner.request.create({
        data: { clientId: co.x, type: 'letter', title: `${MARK} since`, createdByUserId: managerX.userId },
      });
      await http().post(`/requests/${r.id}/process`).set('Cookie', hr.cookie).send({ status: 'info_needed', note: 'Which bank?' }).expect(200);
      const row = await owner.request.findUniqueOrThrow({ where: { id: r.id } });
      expect(row.infoNeededSince).not.toBeNull();
      expect(Math.abs(row.infoNeededSince!.getTime() - Date.now())).toBeLessThan(60_000);
    });

    it('the requester’s reply returns it and moves the due date by exactly the paused working days', async () => {
      const { id, since } = await waitingSince(9, '2026-12-01');
      await http().post(`/requests/${id}/comments`).set('Cookie', managerX.cookie).send({ body: 'Al Rajhi.' }).expect(201);
      const row = await owner.request.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe('open');
      expect(row.infoNeededSince).toBeNull();
      const n = paused(since);
      expect(n).toBeGreaterThan(0);
      expect(iso(row.dueDate)).toBe(iso(addWorkingDays(new Date('2026-12-01T00:00:00Z'), n, SUN_THU)));
      const audit = await owner.auditEntry.findFirst({
        where: { resource: 'request', resourceId: id, action: 'service-level-paused' },
      });
      expect(audit?.after).toMatchObject({ pausedWorkingDays: n, dueDate: iso(row.dueDate) });
    });

    it('staff moving it on by hand pause the clock the same way', async () => {
      const { id, since } = await waitingSince(4, '2026-12-01');
      await http().post(`/requests/${id}/process`).set('Cookie', hr.cookie).send({ status: 'in_progress' }).expect(200);
      const row = await owner.request.findUniqueOrThrow({ where: { id } });
      expect(row.infoNeededSince).toBeNull();
      expect(iso(row.dueDate)).toBe(iso(addWorkingDays(new Date('2026-12-01T00:00:00Z'), paused(since), SUN_THU)));
    });

    it('in the company’s own working week', async () => {
      const { id, since } = await waitingSince(9, '2026-12-01', co.mf);
      await http().post(`/requests/${id}/comments`).set('Cookie', managerMf.cookie).send({ body: 'Done.' }).expect(201);
      expect(await dueOf(id)).toBe(iso(addWorkingDays(new Date('2026-12-01T00:00:00Z'), paused(since, MON_FRI), MON_FRI)));
    });

    it('a request with no due date stays without one', async () => {
      const { id } = await waitingSince(9, null);
      await http().post(`/requests/${id}/comments`).set('Cookie', managerX.cookie).send({ body: 'Here.' }).expect(201);
      expect(await dueOf(id)).toBeNull();
    });

    it('a wait that began today pauses nothing', async () => {
      const { id } = await waitingSince(0, '2026-12-01');
      await http().post(`/requests/${id}/comments`).set('Cookie', managerX.cookie).send({ body: 'Quick.' }).expect(201);
      expect(await dueOf(id)).toBe('2026-12-01');
    });

    it('finishing a request never touches its due date', async () => {
      const r = await owner.request.create({
        data: { clientId: co.x, type: 'letter', title: `${MARK} finish`, createdByUserId: managerX.userId, status: 'in_progress', dueDate: new Date('2026-12-01T00:00:00Z') },
      });
      await http().post(`/requests/${r.id}/process`).set('Cookie', hr.cookie).send({ status: 'resolved' }).expect(200);
      expect(await dueOf(r.id)).toBe('2026-12-01');
    });

    it('the database keeps the wait’s start with the waiting status', async () => {
      const r = await owner.request.create({
        data: { clientId: co.x, type: 'letter', title: `${MARK} chk`, createdByUserId: managerX.userId },
      });
      await expect(
        owner.request.update({ where: { id: r.id }, data: { status: 'info_needed', infoReturnsTo: 'open' } }),
      ).rejects.toThrow();
      await expect(owner.request.update({ where: { id: r.id }, data: { infoNeededSince: new Date() } })).rejects.toThrow();
    });
  });
});
