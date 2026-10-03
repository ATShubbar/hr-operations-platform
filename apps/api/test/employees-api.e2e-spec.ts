import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  cleanupHelperUsers,
  loginAsStaff,
  type TestPrincipal,
  loginAsEnrolledStaff,
} from './helpers/login';

// EMP-02: Employees API with FIELD-LEVEL authorization. All test roles here are
// non-admin staff (not MFA-required) so logins are direct.

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const MARK = 'EMP-02-test';

interface EmployeeBody {
  id: string;
  name: { ar: string; en: string };
  employmentStatus: string;
  salary: { basicSalary: number | null } | null;
  govdata: { iqamaNumber: string | null; iqamaExpiry: string | null } | null;
}

describe('Employees API — field-level authorization (EMP-02, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  // v1.7 (ADR-013) columns.
  let hr: TestPrincipal; // employee CRU + salary RU + govdata RU
  let gro: TestPrincipal; // employee R + govdata RU — no pay
  let readOnly: TestPrincipal; // Auditor — reads every group, writes none
  let admin: TestPrincipal; // Administrator — the only terminate (employee.delete)
  let targetId = '';
  const createdIds: string[] = [];

  const http = () => app.getHttpServer();

  async function createVia(cookie: string, body: Record<string, unknown>): Promise<EmployeeBody> {
    const res = await request(http()).post('/employees').set('Cookie', cookie).send(body);
    if (res.status === 201) createdIds.push((res.body as EmployeeBody).id);
    return res.body as EmployeeBody;
  }

  const baseCreate = (extra: Record<string, unknown> = {}) => ({
    clientId: CLIENT_A,
    name: { ar: 'اسم', en: `${MARK} ${Math.round(Math.random() * 1e9)}` },
    nationality: 'EG',
    contractType: 'fixed_term',
    ...extra,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    hr = await loginAsStaff(app, 'hr_officer');
    gro = await loginAsStaff(app, 'gro_officer');
    readOnly = await loginAsEnrolledStaff(app, 'auditor');
    admin = await loginAsEnrolledStaff(app, 'administrator');

    await owner.auditEntry.deleteMany({ where: { resource: 'employee' } });
    await owner.employee.deleteMany({ where: { nameEn: { startsWith: MARK } } });
    const target = await owner.employee.create({
      data: {
        clientId: CLIENT_A,
        nameAr: 'هدف',
        nameEn: `${MARK} target`,
        nationality: 'EG',
        contractType: 'fixed_term',
        basicSalary: 6000,
        housingAllowance: 1500,
        iqamaNumber: '2333444555',
        iqamaExpiry: new Date('2027-06-01'),
        gosiRegistrationStatus: 'registered',
      },
    });
    targetId = target.id;
    createdIds.push(targetId);
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { resource: 'employee' } });
    await owner.employee.deleteMany({ where: { nameEn: { startsWith: MARK } } });
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  const getAs = (cookie: string) =>
    request(http()).get(`/employees/${targetId}`).set('Cookie', cookie);

  // ---- read redaction per role ----

  it('GRO sees CORE + GOVDATA (incl. identifiers), not salary', async () => {
    const body = (await getAs(gro.cookie).expect(200)).body as EmployeeBody;
    expect(body.salary).toBeNull();
    expect(body.govdata?.iqamaNumber).toBe('2333444555');
  });

  it('HR Officer sees ALL groups', async () => {
    const body = (await getAs(hr.cookie).expect(200)).body as EmployeeBody;
    expect(body.salary?.basicSalary).toBe(6000);
    expect(body.govdata?.iqamaNumber).toBe('2333444555');
  });

  // ADR-013 widening: Read Only saw core + govdata; the Auditor reads pay too.
  it('the Auditor sees ALL groups, pay included', async () => {
    const body = (await getAs(readOnly.cookie).expect(200)).body as EmployeeBody;
    expect(body.name.en).toBe(`${MARK} target`);
    expect(body.salary?.basicSalary).toBe(6000);
    expect(body.govdata?.iqamaNumber).toBe('2333444555');
  });

  it('unauthenticated → 401', async () => {
    await request(http()).get('/employees').expect(401);
  });

  // ---- create (write-gating on the salary/govdata blocks) ----

  it('HR creates with salary (has salary.update) → 201', async () => {
    const body = await createVia(hr.cookie, baseCreate({ salary: { basicSalary: 5000 } }));
    expect(body.salary?.basicSalary).toBe(5000);
  });

  // ADR-013 widening: the HR officer now writes government data (procedures RWC).
  it('HR creates with govdata (v1.7: govdata.update) → 201', async () => {
    const body = await createVia(hr.cookie, baseCreate({ govdata: { iqamaNumber: '2000000000' } }));
    expect(body.govdata?.iqamaNumber).toBe('2000000000');
  });

  it('GRO and the Auditor cannot create (no employee.create) → 403', async () => {
    await request(http())
      .post('/employees')
      .set('Cookie', gro.cookie)
      .send(baseCreate())
      .expect(403);
    await request(http())
      .post('/employees')
      .set('Cookie', readOnly.cookie)
      .send(baseCreate())
      .expect(403);
  });

  // ---- per-group update endpoints ----

  it('HR updates SALARY and GOVDATA; the Auditor updates nothing', async () => {
    const emp = await createVia(hr.cookie, baseCreate({ salary: { basicSalary: 4000 } }));
    await request(http())
      .patch(`/employees/${emp.id}/salary`)
      .set('Cookie', hr.cookie)
      .send({ basicSalary: 4200 })
      .expect(200);
    await request(http())
      .patch(`/employees/${emp.id}/govdata`)
      .set('Cookie', hr.cookie)
      .send({ iqamaNumber: '2111111111' })
      .expect(200);
    for (const path of ['/salary', '/govdata', '']) {
      await request(http())
        .patch(`/employees/${emp.id}${path}`)
        .set('Cookie', readOnly.cookie)
        .send(
          path === '/salary'
            ? { basicSalary: 1 }
            : path === '/govdata'
              ? { iqamaNumber: '2999999999' }
              : { department: 'X' },
        )
        .expect(403);
    }
  });

  it('GRO updates GOVDATA (govdata.update) but not SALARY', async () => {
    const emp = await createVia(hr.cookie, baseCreate());
    const res = await request(http())
      .patch(`/employees/${emp.id}/govdata`)
      .set('Cookie', gro.cookie)
      .send({ iqamaNumber: '2222222222', gosiRegistrationStatus: 'registered' })
      .expect(200);
    expect((res.body as EmployeeBody).govdata?.iqamaNumber).toBe('2222222222');
    await request(http())
      .patch(`/employees/${emp.id}/salary`)
      .set('Cookie', gro.cookie)
      .send({ basicSalary: 1 })
      .expect(403);
    // ADR-013 narrowing: core profile is R for GRO (was RU).
    await request(http())
      .patch(`/employees/${emp.id}`)
      .set('Cookie', gro.cookie)
      .send({ department: 'X' })
      .expect(403);
  });

  // DS-07 found this: the govdata write schema reused the RESPONSE schema, whose
  // expiry fields are plain strings, so a date-only value ("2027-10-27") reached
  // Prisma unconverted and every expiry edit returned 500. Nothing tested it.
  it('govdata expiry dates can be written as plain dates (was a 500)', async () => {
    const emp = await createVia(hr.cookie, baseCreate());
    const res = await request(http())
      .patch(`/employees/${emp.id}/govdata`)
      .set('Cookie', hr.cookie)
      .send({
        iqamaExpiry: '2027-10-27',
        passportExpiry: '2030-01-15',
        workPermitExpiry: '2027-10-27',
        exitReentryExpiry: '2026-12-31',
      })
      .expect(200);
    const g = (res.body as EmployeeBody).govdata as unknown as Record<string, string>;
    expect(g.iqamaExpiry?.slice(0, 10)).toBe('2027-10-27');
    expect(g.passportExpiry?.slice(0, 10)).toBe('2030-01-15');
    expect(g.workPermitExpiry?.slice(0, 10)).toBe('2027-10-27');
    expect(g.exitReentryExpiry?.slice(0, 10)).toBe('2026-12-31');
    // Garbage is still a 400, not a 500.
    await request(http())
      .patch(`/employees/${emp.id}/govdata`)
      .set('Cookie', hr.cookie)
      .send({ iqamaExpiry: 'not-a-date' })
      .expect(400);
  });

  // ADR-013 narrowing: the prototype's HR is RWC on employee records — no delete.
  it('the Administrator terminates (soft delete → terminated); HR and GRO cannot', async () => {
    const emp = await createVia(hr.cookie, baseCreate());
    await request(http()).delete(`/employees/${emp.id}`).set('Cookie', hr.cookie).expect(403);
    await request(http()).delete(`/employees/${emp.id}`).set('Cookie', gro.cookie).expect(403);
    const res = await request(http())
      .delete(`/employees/${emp.id}`)
      .set('Cookie', admin.cookie)
      .expect(200);
    expect((res.body as EmployeeBody).employmentStatus).toBe('terminated');
    expect(await owner.employee.count({ where: { id: emp.id } })).toBe(1); // soft
  });

  it('mutations are audited (create + salary-update + govdata-update + terminate)', async () => {
    const entries = await owner.auditEntry.findMany({ where: { resource: 'employee' } });
    const actions = new Set(entries.map((e) => e.action));
    expect(actions.has('create')).toBe(true);
    expect(actions.has('salary-update')).toBe(true);
    expect(actions.has('govdata-update')).toBe(true);
    expect(actions.has('terminate')).toBe(true);
    // Audit snapshots carry NO salary/govdata values.
    const dump = JSON.stringify(entries.map((e) => [e.before, e.after]));
    expect(dump).not.toMatch(/basicSalary|iqamaNumber|2333444555/);
  });
});
