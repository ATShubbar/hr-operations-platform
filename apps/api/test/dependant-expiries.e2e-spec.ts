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

// DEP-05a (ADR-017 rev. 1): GET /dependants/expiries — every current
// dependant's three expiry dates, for the runway and the "expiring" figures.
// Staff who read employees; DATES ONLY (no name, no birth date, no iqama
// number); never a removed dependant; refused to client managers and employees.
const MARK = 'DEP-05-test';
const KEYS = ['employeeId', 'insuranceExpiry', 'iqamaExpiry', 'passportExpiry'];
const db = () =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

type Row = Record<(typeof KEYS)[number], string | null>;

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

async function fixtures(owner: PrismaClient) {
  const x = (await owner.client.create({ data: { nameAr: 'شركة س', nameEn: `${MARK} X` } })).id;
  const y = (await owner.client.create({ data: { nameAr: 'شركة ص', nameEn: `${MARK} Y` } })).id;
  const person = async (clientId: string, name: string) =>
    (
      await owner.employee.create({
        data: { clientId, nameAr: 'اختبار', nameEn: `${MARK} ${name}`, nationality: 'IN', contractType: 'unlimited' },
      })
    ).id;
  const a = await person(x, 'a');
  const b = await person(y, 'b');
  const admin = (await owner.authUser.findFirstOrThrow({ where: { role: 'administrator' } })).id;
  await owner.dependant.createMany({
    data: [
      // a: a wife with all three dates, a son with one, and a daughter REMOVED.
      { employeeId: a, relationship: 'spouse', nameEn: `${MARK} wife`, iqamaNumber: '2555000111', iqamaExpiry: d('2027-01-15'), passportExpiry: d('2030-06-01'), insuranceExpiry: d('2026-12-31') },
      { employeeId: a, relationship: 'son', nameEn: `${MARK} son`, dateOfBirth: d('2018-03-03'), iqamaExpiry: d('2027-02-20') },
      { employeeId: a, relationship: 'daughter', nameEn: `${MARK} removed`, iqamaExpiry: d('2026-11-11'), removedAt: new Date(), removedByUserId: admin },
      // b, at another company: one dependant with no dates at all.
      { employeeId: b, relationship: 'spouse', nameEn: `${MARK} other wife` },
    ],
  });
  return { x, y, a, b };
}

describe('Dependant expiries (DEP-05a, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let ids: Awaited<ReturnType<typeof fixtures>>;
  let hr: TestPrincipal;
  let auditor: TestPrincipal;
  let manager: TestPrincipal;
  let employee: TestPrincipal;

  const get = (who: TestPrincipal, query: Record<string, string> = {}) =>
    request(app.getHttpServer()).get('/dependants/expiries').query(query).set('Cookie', who.cookie);
  const rowsOf = async (who: TestPrincipal, query: Record<string, string> = {}): Promise<Row[]> =>
    (await get(who, query).expect(200)).body.dependants;
  const mine = (rows: Row[]) => rows.filter((r) => r.employeeId === ids.a || r.employeeId === ids.b);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = db();
    await cleanup(owner);
    // The fixtures name an Administrator as the remover; make sure one exists.
    auditor = await loginAsEnrolledStaff(app, 'auditor');
    await loginAsEnrolledStaff(app, 'administrator');
    ids = await fixtures(owner);
    await owner.clientSetting.create({ data: { clientId: ids.x, key: 'flag.employee-self-service', value: true } });
    hr = await loginAsStaff(app, 'hr_officer');
    manager = await loginAsClientRep(app, ids.x, 'client_manager');
    employee = await loginAsEmployee(app, ids.a);
  });

  afterAll(async () => {
    await cleanup(owner);
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('lists every current dependant across companies — dates only, exact keys', async () => {
    const rows = mine(await rowsOf(hr));
    expect(rows).toHaveLength(3); // wife + son + the other company's wife; not the removed daughter
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(KEYS);
    const ofA = rows.filter((r) => r.employeeId === ids.a).sort((p, q) => (p.iqamaExpiry ?? '').localeCompare(q.iqamaExpiry ?? ''));
    expect(ofA).toEqual([
      { employeeId: ids.a, iqamaExpiry: '2027-01-15', passportExpiry: '2030-06-01', insuranceExpiry: '2026-12-31' },
      { employeeId: ids.a, iqamaExpiry: '2027-02-20', passportExpiry: null, insuranceExpiry: null },
    ]);
    expect(rows.find((r) => r.employeeId === ids.b)).toEqual({
      employeeId: ids.b,
      iqamaExpiry: null,
      passportExpiry: null,
      insuranceExpiry: null,
    });
  });

  it('carries no name, no birth date and no iqama number — anywhere in the response', async () => {
    const text = (await get(hr).expect(200)).text;
    expect(text).not.toContain(MARK); // every fixture dependant is NAMED with the mark
    expect(text).not.toContain('2555000111');
    expect(text).not.toContain('2018-03-03');
  });

  it('never includes a removed dependant', async () => {
    const dates = mine(await rowsOf(hr)).map((r) => r.iqamaExpiry);
    expect(dates).not.toContain('2026-11-11');
  });

  it('narrows to one company; a bad company id is refused', async () => {
    expect(mine(await rowsOf(hr, { clientId: ids.x })).map((r) => r.employeeId)).toEqual([ids.a, ids.a]);
    expect(mine(await rowsOf(hr, { clientId: ids.y })).map((r) => r.employeeId)).toEqual([ids.b]);
    await get(hr, { clientId: 'not-an-id' }).expect(400);
    await get(hr, { clientId: ids.x, extra: '1' }).expect(400);
  });

  it('the Auditor reads it too', async () => {
    expect(mine(await rowsOf(auditor))).toHaveLength(3);
  });

  it('is refused to a client manager, an employee and the unauthenticated', async () => {
    await get(manager).expect(403);
    await get(manager, { clientId: ids.x }).expect(403);
    await get(employee).expect(403);
    await request(app.getHttpServer()).get('/dependants/expiries').expect(401);
  });
});

// No client role holds employee.read today, so the permission alone would keep
// a client manager out. Granting it here proves the staff check is a second
// lock (the DEP-02 pattern): a family is not the employer's business (ADR-017).
describe('Dependant expiries — staff only, even for a widened client role (DEP-05a)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let manager: TestPrincipal;

  class WidenedPolicy extends PolicyService {
    override can(role: string | null | undefined, permission: string): boolean {
      if (role === 'client_manager' && permission === 'employee.read') return true;
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
    const clientId = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} widened` } })).id;
    manager = await loginAsClientRep(app, clientId, 'client_manager');
  });

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await cleanup(owner);
    await owner.$disconnect();
    await app.close();
  });

  it('a client manager granted employee.read is still refused', async () => {
    await request(app.getHttpServer()).get('/dependants/expiries').set('Cookie', manager.cookie).expect(403);
  });
});
