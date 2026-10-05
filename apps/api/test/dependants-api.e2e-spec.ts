import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { PolicyService } from '../src/modules/auth/public-api';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEmployee,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// DEP-02 (ADR-017): the dependants API. Staff read with employee.read and change
// with govdata.update (Administrator, HR officer, GRO officer); the Auditor
// reads; client managers and employees are refused on the staff routes; an
// employee reads their OWN family on /me/dependants, numbers included, behind
// the company's self-service switch. Responses are exact whitelists.
const MARK = 'DEP-02-test';
const STAFF_KEYS = [
  'dateOfBirth',
  'employeeId',
  'id',
  'identifierVisible',
  'insuranceExpiry',
  'iqamaExpiry',
  'iqamaNumber',
  'nameAr',
  'nameEn',
  'passportExpiry',
  'relationship',
];
const SELF_KEYS = STAFF_KEYS.filter((k) => k !== 'employeeId' && k !== 'identifierVisible');
const NOBODY = '33333333-3333-4333-8333-0000000000d2';

const db = () =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });

async function fixtures(owner: PrismaClient) {
  const on = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} on` } })).id;
  const off = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} off` } })).id;
  await owner.clientSetting.create({
    data: { clientId: on, key: 'flag.employee-self-service', value: true },
  });
  const mk = async (clientId: string, name: string) =>
    (
      await owner.employee.create({
        data: {
          clientId,
          nameAr: 'اختبار',
          nameEn: `${MARK} ${name}`,
          nationality: 'IN',
          contractType: 'unlimited',
        },
      })
    ).id;
  return {
    on,
    off,
    me: await mk(on, 'me'),
    colleague: await mk(on, 'colleague'),
    elsewhere: await mk(off, 'elsewhere'),
  };
}

async function cleanup(owner: PrismaClient) {
  const clients = (
    await owner.client.findMany({ where: { nameEn: { startsWith: MARK } }, select: { id: true } })
  ).map((c) => c.id);
  const emps = (
    await owner.employee.findMany({ where: { clientId: { in: clients } }, select: { id: true } })
  ).map((e) => e.id);
  await owner.dependant.deleteMany({ where: { employeeId: { in: emps } } });
  await owner.employee.deleteMany({ where: { id: { in: emps } } });
  await owner.clientSetting.deleteMany({ where: { clientId: { in: clients } } });
  await owner.client.deleteMany({ where: { id: { in: clients } } });
}

describe('Dependants API (DEP-02, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let ids: Awaited<ReturnType<typeof fixtures>>;
  const p: Record<'admin' | 'hr' | 'gro' | 'auditor' | 'manager', TestPrincipal> = {} as never;
  let me: TestPrincipal;
  let colleague: TestPrincipal;
  let elsewhere: TestPrincipal;

  const http = () => request(app.getHttpServer());
  const base = (employeeId: string) => `/employees/${employeeId}/dependants`;
  const add = (who: TestPrincipal, employeeId: string, body: object) =>
    http().post(base(employeeId)).set('Cookie', who.cookie).send(body);
  const wife = (nameEn = `${MARK} wife`) => ({
    relationship: 'spouse',
    nameEn,
    nameAr: 'زوجة',
    dateOfBirth: '1990-04-12',
    iqamaNumber: '2111111111',
    iqamaExpiry: '2027-01-15',
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = db();
    await cleanup(owner);
    ids = await fixtures(owner);
    p.admin = await loginAsEnrolledStaff(app, 'administrator');
    p.hr = await loginAsStaff(app, 'hr_officer');
    p.gro = await loginAsStaff(app, 'gro_officer');
    p.auditor = await loginAsEnrolledStaff(app, 'auditor');
    p.manager = await loginAsClientRep(app, ids.on);
    me = await loginAsEmployee(app, ids.me);
    colleague = await loginAsEmployee(app, ids.colleague);
    elsewhere = await loginAsEmployee(app, ids.elsewhere);
  });

  afterAll(async () => {
    await cleanup(owner);
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  describe('staff routes', () => {
    it('the GRO officer adds, the HR officer edits, the Administrator removes — exact response keys', async () => {
      const created = await add(p.gro, ids.me, wife()).expect(201);
      expect(Object.keys(created.body).sort()).toEqual(STAFF_KEYS);
      expect(created.body).toMatchObject({
        employeeId: ids.me,
        relationship: 'spouse',
        iqamaNumber: '2111111111',
        identifierVisible: true,
        dateOfBirth: '1990-04-12',
        iqamaExpiry: '2027-01-15',
        passportExpiry: null,
      });
      const id = created.body.id as string;

      const edited = await http()
        .patch(`${base(ids.me)}/${id}`)
        .set('Cookie', p.hr.cookie)
        .send({ passportExpiry: '2031-08-01', nameAr: null })
        .expect(200);
      expect(edited.body).toMatchObject({
        passportExpiry: '2031-08-01',
        nameAr: null,
        iqamaExpiry: '2027-01-15',
      });

      await http()
        .post(`${base(ids.me)}/${id}/remove`)
        .set('Cookie', p.admin.cookie)
        .expect(204);
      const list = await http().get(base(ids.me)).set('Cookie', p.admin.cookie).expect(200);
      expect(list.body.dependants.map((d: { id: string }) => d.id)).not.toContain(id);
      // Removed means final.
      await http()
        .patch(`${base(ids.me)}/${id}`)
        .set('Cookie', p.hr.cookie)
        .send({ nameAr: 'س' })
        .expect(409);
      await http()
        .post(`${base(ids.me)}/${id}/remove`)
        .set('Cookie', p.hr.cookie)
        .expect(409);
    });

    it('the Auditor reads but changes nothing', async () => {
      const id = (await add(p.hr, ids.me, wife(`${MARK} audited read`)).expect(201)).body
        .id as string;
      const list = await http().get(base(ids.me)).set('Cookie', p.auditor.cookie).expect(200);
      expect(list.body.dependants.map((d: { id: string }) => d.id)).toContain(id);
      await add(p.auditor, ids.me, wife()).expect(403);
      await http()
        .patch(`${base(ids.me)}/${id}`)
        .set('Cookie', p.auditor.cookie)
        .send({ nameAr: 'س' })
        .expect(403);
      await http()
        .post(`${base(ids.me)}/${id}/remove`)
        .set('Cookie', p.auditor.cookie)
        .expect(403);
    });

    it('client managers and employees are refused on every staff route', async () => {
      const id = (await add(p.hr, ids.me, wife(`${MARK} fenced`)).expect(201)).body.id as string;
      for (const who of [p.manager, me]) {
        await http().get(base(ids.me)).set('Cookie', who.cookie).expect(403);
        await add(who, ids.me, wife()).expect(403);
        await http()
          .patch(`${base(ids.me)}/${id}`)
          .set('Cookie', who.cookie)
          .send({ nameAr: 'س' })
          .expect(403);
        await http()
          .post(`${base(ids.me)}/${id}/remove`)
          .set('Cookie', who.cookie)
          .expect(403);
      }
    });

    it('validates strictly (400) and addresses only real, own records (404)', async () => {
      for (const bad of [
        { ...wife(), employeeId: ids.colleague }, // unknown key
        { ...wife(), removedAt: '2026-01-01' },
        { ...wife(), iqamaNumber: '1111111111' }, // not 2…
        { ...wife(), iqamaNumber: '21111' },
        { ...wife(), dateOfBirth: '2026-02-30' }, // not a real date
        { ...wife(), iqamaExpiry: '2027-01-15T10:00:00Z' }, // not date-only
        { ...wife(), relationship: 'father' },
        { ...wife(), nameEn: '   ' },
      ])
        await add(p.hr, ids.me, bad).expect(400);
      const id = (await add(p.hr, ids.me, wife(`${MARK} valid`)).expect(201)).body.id as string;
      await http()
        .patch(`${base(ids.me)}/${id}`)
        .set('Cookie', p.hr.cookie)
        .send({})
        .expect(400);

      await add(p.hr, NOBODY, wife()).expect(404);
      await http().get(base(NOBODY)).set('Cookie', p.hr.cookie).expect(404);
      await http().get(base('not-a-uuid')).set('Cookie', p.hr.cookie).expect(404);
      // Another sponsor's dependant, addressed through this employee: not found.
      await http()
        .patch(`${base(ids.colleague)}/${id}`)
        .set('Cookie', p.hr.cookie)
        .send({ nameAr: 'س' })
        .expect(404);
      await http()
        .post(`${base(ids.colleague)}/${id}/remove`)
        .set('Cookie', p.hr.cookie)
        .expect(404);
      await http()
        .patch(`${base(ids.me)}/not-a-uuid`)
        .set('Cookie', p.hr.cookie)
        .send({ nameAr: 'س' })
        .expect(404);
    });

    it('every change is audited against the sponsor', async () => {
      const before = await owner.auditEntry.count({
        where: { resource: 'dependant', resourceId: ids.colleague },
      });
      const id = (await add(p.gro, ids.colleague, wife(`${MARK} audit`)).expect(201)).body
        .id as string;
      await http()
        .patch(`${base(ids.colleague)}/${id}`)
        .set('Cookie', p.gro.cookie)
        .send({ nameAr: 'س' })
        .expect(200);
      await http()
        .post(`${base(ids.colleague)}/${id}/remove`)
        .set('Cookie', p.gro.cookie)
        .expect(204);
      const actions = (
        await owner.auditEntry.findMany({
          where: { resource: 'dependant', resourceId: ids.colleague },
          orderBy: { id: 'asc' },
          select: { action: true },
        })
      ).map((a) => a.action);
      expect(actions.length).toBe(before + 3);
      expect(actions.slice(-3)).toEqual(['create', 'update', 'remove']);
    });
  });

  describe('GET /me/dependants', () => {
    it("an employee reads their OWN family, numbers included — never a colleague's", async () => {
      await add(p.hr, ids.colleague, wife(`${MARK} colleague wife`)).expect(201);
      const mine = (await add(p.hr, ids.me, wife(`${MARK} my wife`)).expect(201)).body.id as string;
      const res = await http().get('/me/dependants').set('Cookie', me.cookie).expect(200);
      const rows = res.body.dependants as Array<Record<string, unknown>>;
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(Object.keys(r).sort()).toEqual(SELF_KEYS);
      expect(rows.map((r) => r.id)).toContain(mine);
      expect(rows.find((r) => r.id === mine)).toMatchObject({ iqamaNumber: '2111111111' });
      expect(JSON.stringify(rows)).not.toContain('colleague wife');

      const theirs = await http().get('/me/dependants').set('Cookie', colleague.cookie).expect(200);
      expect(JSON.stringify(theirs.body)).not.toContain(mine);
    });

    it('removed dependants do not appear', async () => {
      const id = (await add(p.hr, ids.me, wife(`${MARK} to remove`)).expect(201)).body.id as string;
      await http()
        .post(`${base(ids.me)}/${id}/remove`)
        .set('Cookie', p.hr.cookie)
        .expect(204);
      const res = await http().get('/me/dependants').set('Cookie', me.cookie).expect(200);
      expect(res.body.dependants.map((d: { id: string }) => d.id)).not.toContain(id);
    });

    it("refused when the company's self-service is off, and to staff and client managers", async () => {
      await http().get('/me/dependants').set('Cookie', elsewhere.cookie).expect(403);
      await http().get('/me/dependants').set('Cookie', p.hr.cookie).expect(403);
      await http().get('/me/dependants').set('Cookie', p.manager.cookie).expect(403);
      await http().get('/me/dependants').expect(401);
    });
  });
});

// The iqama-number mask, proven against a NARROWER reader than any v1.7 role
// (every staff role holds govdata.read today): the HR officer with govdata.read
// withheld still sees the family, but not the number — and is told so.
describe('Dependants API — the identifier mask (DEP-02, narrowed policy)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let employeeId = '';

  class NarrowedPolicy extends PolicyService {
    override can(role: string | null | undefined, permission: string): boolean {
      if (role === 'hr_officer' && permission === 'govdata.read') return false;
      return super.can(role, permission);
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PolicyService)
      .useClass(NarrowedPolicy)
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = db();
    const clientId = (
      await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} mask` } })
    ).id;
    employeeId = (
      await owner.employee.create({
        data: {
          clientId,
          nameAr: 'اختبار',
          nameEn: `${MARK} masked`,
          nationality: 'IN',
          contractType: 'unlimited',
        },
      })
    ).id;
    await owner.dependant.create({
      data: {
        employeeId,
        relationship: 'spouse',
        nameEn: `${MARK} masked wife`,
        iqamaNumber: '2222222222',
      },
    });
  });

  afterAll(async () => {
    await cleanup(owner);
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('a reader without govdata.read gets the family with the iqama number masked', async () => {
    const hr = await loginAsStaff(app, 'hr_officer');
    const res = await request(app.getHttpServer())
      .get(`/employees/${employeeId}/dependants`)
      .set('Cookie', hr.cookie)
      .expect(200);
    expect(res.body.dependants).toHaveLength(1);
    expect(res.body.dependants[0]).toMatchObject({
      nameEn: `${MARK} masked wife`,
      iqamaNumber: null,
      identifierVisible: false,
    });
    expect(JSON.stringify(res.body)).not.toContain('2222222222');

    // …while a reader WITH it still sees the number (the mask is per reader).
    const gro = await loginAsStaff(app, 'gro_officer');
    const full = await request(app.getHttpServer())
      .get(`/employees/${employeeId}/dependants`)
      .set('Cookie', gro.cookie)
      .expect(200);
    expect(full.body.dependants[0]).toMatchObject({
      iqamaNumber: '2222222222',
      identifierVisible: true,
    });
  });
});

// The staff-only check, proven against a WIDER grant than any v1.7 role: a
// client manager handed employee.read and govdata.update is still refused on
// every staff route — family details are not the employer's business
// (ADR-017), whatever a future role edit grants.
describe('Dependants API — staff only, even for a widened client role (DEP-02)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let clientId = '';
  let employeeId = '';
  let dependantId = '';

  class WidenedPolicy extends PolicyService {
    override can(role: string | null | undefined, permission: string): boolean {
      if (
        role === 'client_manager' &&
        (permission === 'employee.read' || permission === 'govdata.update')
      )
        return true;
      return super.can(role, permission);
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PolicyService)
      .useClass(WidenedPolicy)
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = db();
    clientId = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} widened` } }))
      .id;
    employeeId = (
      await owner.employee.create({
        data: {
          clientId,
          nameAr: 'اختبار',
          nameEn: `${MARK} widened`,
          nationality: 'IN',
          contractType: 'unlimited',
        },
      })
    ).id;
    dependantId = (
      await owner.dependant.create({
        data: { employeeId, relationship: 'spouse', nameEn: `${MARK} widened wife` },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanup(owner);
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it("the company's own client manager is refused on every staff route", async () => {
    const manager = await loginAsClientRep(app, clientId);
    const http = () => request(app.getHttpServer());
    const base = `/employees/${employeeId}/dependants`;
    await http().get(base).set('Cookie', manager.cookie).expect(403);
    await http()
      .post(base)
      .set('Cookie', manager.cookie)
      .send({ relationship: 'son', nameEn: `${MARK} forged` })
      .expect(403);
    await http()
      .patch(`${base}/${dependantId}`)
      .set('Cookie', manager.cookie)
      .send({ nameAr: 'س' })
      .expect(403);
    await http().post(`${base}/${dependantId}/remove`).set('Cookie', manager.cookie).expect(403);
    expect(await owner.dependant.count({ where: { employeeId } })).toBe(1);
  });
});
