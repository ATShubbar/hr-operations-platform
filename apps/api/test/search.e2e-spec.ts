import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { PolicyService } from '../src/modules/auth/public-api';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEmployee,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// SEARCH-01 (ADR-015): GET /search, per role. Fixtures in two companies made here
// — X (client portal ON, employee self-service ON) and Y (both off) — with an
// unusual word ("Zephyr") so nothing in the seed can match.
const MARK = 'SEARCH-01-test';
const IQAMA = '2987654321';

describe('Global search (SEARCH-01, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  const co = { x: '', y: '' };
  const emp = { ahmed: '', colleague: '', outsider: '' };
  let hr: TestPrincipal;
  let gro: TestPrincipal;
  let managerX: TestPrincipal;
  let managerY: TestPrincipal;
  let me: TestPrincipal & { employeeId: string };
  const ids = { procedure: '', taskMine: '', taskOther: '', requestX: '', requestY: '', leaveMine: '', leaveColleague: '' };

  const http = () => request(app.getHttpServer());
  const find = async (who: TestPrincipal, q: string) =>
    (await http().get('/search').query({ q }).set('Cookie', who.cookie).expect(200)).body as {
      hits: { kind: string; id: string; matchedOn?: string }[];
      truncated: boolean;
    };
  const idsOf = (r: { hits: { id: string }[] }) => r.hits.map((h) => h.id);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });

    co.x = (await owner.client.create({ data: { nameAr: 'شركة زفير', nameEn: `${MARK} Zephyr Co` } })).id;
    co.y = (await owner.client.create({ data: { nameAr: 'شركة أخرى', nameEn: `${MARK} Other Co` } })).id;
    await owner.clientSetting.createMany({
      data: [
        { clientId: co.x, key: 'flag.client-self-service', value: true },
        { clientId: co.x, key: 'flag.employee-self-service', value: true },
      ],
    });
    const person = async (clientId: string, nameEn: string, nameAr: string, extra: object = {}) =>
      (
        await owner.employee.create({
          data: { clientId, nameEn, nameAr, nationality: 'EG', contractType: 'unlimited', ...extra },
        })
      ).id;
    emp.ahmed = await person(co.x, `${MARK} Zephyr Ahmed`, 'أحمد زفير', { iqamaNumber: IQAMA });
    emp.colleague = await person(co.x, `${MARK} Zephyr Colleague`, 'زميل زفير');
    emp.outsider = await person(co.y, `${MARK} Zephyr Outsider`, 'غريب زفير');

    hr = await loginAsStaff(app, 'hr_officer');
    gro = await loginAsStaff(app, 'gro_officer');
    managerX = await loginAsClientRep(app, co.x);
    managerY = await loginAsClientRep(app, co.y);
    me = await loginAsEmployee(app, emp.ahmed);

    ids.procedure = (
      await owner.groProcess.create({
        data: { clientId: co.x, employeeId: emp.ahmed, type: 'iqama_renewal', referenceNumber: 'ZPH-778899' },
      })
    ).id;
    ids.taskMine = (await owner.task.create({ data: { title: 'Zephyr audit prep', assigneeUserId: hr.userId } })).id;
    ids.taskOther = (await owner.task.create({ data: { title: 'Zephyr someone else', assigneeUserId: gro.userId } })).id;
    const req = (clientId: string, title: string, extra: object = {}) =>
      owner.request.create({ data: { clientId, type: 'letter', title, createdByUserId: hr.userId, ...extra } });
    ids.requestX = (await req(co.x, 'Zephyr salary letter', { requesterEmployeeId: emp.ahmed })).id;
    ids.requestY = (await req(co.y, 'Zephyr other letter')).id;
    const leave = (employeeId: string, clientId: string, extra: object = {}) =>
      owner.leaveRequest.create({
        data: {
          clientId,
          employeeId,
          type: 'annual',
          startDate: new Date('2026-12-01T00:00:00Z'),
          days: 1,
          endDate: new Date('2026-12-01T00:00:00Z'),
          raisedByUserId: hr.userId,
          ...extra,
        },
      });
    ids.leaveMine = (await leave(emp.ahmed, co.x)).id;
    ids.leaveColleague = (await leave(emp.colleague, co.x)).id;
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    const companies = { in: [co.x, co.y] };
    await owner.leaveRequest.deleteMany({ where: { clientId: companies } });
    await owner.request.deleteMany({ where: { clientId: companies } });
    await owner.task.deleteMany({ where: { id: { in: [ids.taskMine, ids.taskOther] } } });
    await owner.groProcess.deleteMany({ where: { clientId: companies } });
    await cleanupHelperUsers(app);
    await owner.employee.deleteMany({ where: { clientId: companies } });
    await owner.clientSetting.deleteMany({ where: { clientId: companies } });
    await owner.client.deleteMany({ where: { id: companies } });
    await owner.$disconnect();
    await app.close();
  });

  describe('staff', () => {
    it('finds people by name, Arabic folded (احمد finds أحمد), across companies', async () => {
      const r = await find(hr, 'احمد زفير');
      expect(r.hits).toContainEqual(expect.objectContaining({ kind: 'person', id: emp.ahmed, matchedOn: 'name' }));
      const all = await find(hr, 'Zephyr');
      expect(idsOf(all)).toEqual(expect.arrayContaining([emp.ahmed, emp.colleague, emp.outsider]));
    });

    it('finds a person by iqama number, spaces ignored — and audits it with the last four digits only', async () => {
      const before = await owner.auditEntry.count({ where: { resource: 'search' } });
      const r = await find(hr, '2987 654 321');
      expect(r.hits).toContainEqual(expect.objectContaining({ kind: 'person', id: emp.ahmed, matchedOn: 'iqama' }));
      const entries = await owner.auditEntry.findMany({
        where: { resource: 'search', action: 'identifier-lookup', actorId: hr.userId },
        orderBy: { id: 'desc' },
        take: 1,
      });
      expect(await owner.auditEntry.count({ where: { resource: 'search' } })).toBe(before + 1);
      expect(entries[0]?.after).toMatchObject({ identifierKinds: ['iqama'], last4: '4321', matched: 1 });
      // The full number appears nowhere in the entry (ids are BigInt — stringify them).
      expect(JSON.stringify(entries[0], (_k, v) => (typeof v === 'bigint' ? String(v) : v))).not.toContain(IQAMA);
    });

    it('a name search is not audited', async () => {
      const before = await owner.auditEntry.count({ where: { resource: 'search' } });
      await find(hr, 'Zephyr');
      expect(await owner.auditEntry.count({ where: { resource: 'search' } })).toBe(before);
    });

    it('without govdata.read, an identifier finds nobody (and nothing is audited)', async () => {
      const policy = app.get(PolicyService);
      const real = policy.can.bind(policy);
      vi.spyOn(policy, 'can').mockImplementation((role, p) => (p === 'govdata.read' ? false : real(role, p)));
      const before = await owner.auditEntry.count({ where: { resource: 'search' } });
      const r = await find(hr, IQAMA);
      expect(r.hits.filter((h) => h.kind === 'person')).toEqual([]);
      expect(await owner.auditEntry.count({ where: { resource: 'search' } })).toBe(before);
    });

    it('finds clients, a procedure by reference, requests and leave', async () => {
      const r = await find(gro, 'Zephyr');
      expect(r.hits).toContainEqual(expect.objectContaining({ kind: 'client', id: co.x }));
      expect(r.hits).toContainEqual(expect.objectContaining({ kind: 'request', id: ids.requestX }));
      const proc = await find(gro, 'zph-7788');
      expect(proc.hits).toContainEqual(expect.objectContaining({ kind: 'procedure', id: ids.procedure }));
      const lv = await find(hr, 'Zephyr Ahmed');
      expect(idsOf(lv)).toContain(ids.leaveMine);
    });

    it('tasks follow the Tasks rule: own / assigned only without task.read-all', async () => {
      const r = await find(hr, 'Zephyr');
      expect(idsOf(r)).toContain(ids.taskMine);
      expect(idsOf(r)).not.toContain(ids.taskOther);
    });
  });

  describe('client managers', () => {
    it('find their own people (portal on), requests and leave — never another company, never by identifier', async () => {
      const r = await find(managerX, 'Zephyr');
      const kinds = new Set(r.hits.map((h) => h.kind));
      expect(idsOf(r)).toEqual(expect.arrayContaining([emp.ahmed, emp.colleague, ids.requestX, ids.leaveMine]));
      expect(idsOf(r)).not.toContain(emp.outsider);
      expect(idsOf(r)).not.toContain(ids.requestY);
      expect(kinds.has('client') || kinds.has('procedure') || kinds.has('task')).toBe(false);
      expect((await find(managerX, IQAMA)).hits).toEqual([]);
    });

    it('with their portal off, find no people', async () => {
      const r = await find(managerY, 'Zephyr');
      expect(r.hits.filter((h) => h.kind === 'person')).toEqual([]);
      expect(idsOf(r)).toContain(ids.requestY);
    });
  });

  describe('employees', () => {
    it('find their own requests and leave — no people, nothing of a colleague', async () => {
      const r = await find(me, 'Zephyr');
      expect(idsOf(r)).toContain(ids.requestX);
      expect(idsOf(r)).toContain(ids.leaveMine);
      expect(idsOf(r)).not.toContain(ids.leaveColleague);
      expect(r.hits.some((h) => h.kind === 'person')).toBe(false);
    });
  });

  it('fewer than two characters finds nothing; more than twelve hits is truncated', async () => {
    expect(await find(hr, 'Z')).toEqual({ hits: [], truncated: false });
    const many = await find(hr, 'a');
    expect(many.hits).toEqual([]);
    const broad = await find(hr, 'Zephyr');
    expect(broad.hits.length).toBeLessThanOrEqual(12);
  });

  it('is refused to the unauthenticated', async () => {
    await http().get('/search').query({ q: 'Zephyr' }).expect(401);
  });
});
