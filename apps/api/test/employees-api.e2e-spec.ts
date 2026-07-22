import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { cleanupHelperUsers, loginAsStaff, type TestPrincipal } from './helpers/login';

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
  let recruiter: TestPrincipal; // employee.read only
  let hr: TestPrincipal; // employee CRUD + salary RU + govdata R
  let gro: TestPrincipal; // employee RU + govdata CRUD
  let finance: TestPrincipal; // employee R + salary RU
  let readOnly: TestPrincipal; // employee R + govdata R
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
    recruiter = await loginAsStaff(app, 'recruiter');
    hr = await loginAsStaff(app, 'hr_officer');
    gro = await loginAsStaff(app, 'gro_officer');
    finance = await loginAsStaff(app, 'finance');
    readOnly = await loginAsStaff(app, 'read_only');

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

  it('recruiter sees CORE only (salary + govdata redacted)', async () => {
    const body = (await getAs(recruiter.cookie).expect(200)).body as EmployeeBody;
    expect(body.name.en).toBe(`${MARK} target`);
    expect(body.salary).toBeNull();
    expect(body.govdata).toBeNull();
  });

  it('finance sees CORE + SALARY, not govdata', async () => {
    const body = (await getAs(finance.cookie).expect(200)).body as EmployeeBody;
    expect(body.salary?.basicSalary).toBe(6000);
    expect(body.govdata).toBeNull();
  });

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

  it('Read Only sees CORE + GOVDATA, not salary', async () => {
    const body = (await getAs(readOnly.cookie).expect(200)).body as EmployeeBody;
    expect(body.salary).toBeNull();
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

  it('HR creating with govdata (lacks govdata.update) → 403', async () => {
    await request(http())
      .post('/employees')
      .set('Cookie', hr.cookie)
      .send(baseCreate({ govdata: { iqamaNumber: '2000000000' } }))
      .expect(403);
  });

  it('recruiter cannot create (no employee.create) → 403', async () => {
    await request(http()).post('/employees').set('Cookie', recruiter.cookie).send(baseCreate()).expect(403);
  });

  // ---- per-group update endpoints ----

  it('finance updates SALARY (salary.update) but not GOVDATA or core', async () => {
    const emp = await createVia(hr.cookie, baseCreate({ salary: { basicSalary: 4000 } }));
    await request(http())
      .patch(`/employees/${emp.id}/salary`)
      .set('Cookie', finance.cookie)
      .send({ basicSalary: 4200 })
      .expect(200);
    await request(http())
      .patch(`/employees/${emp.id}/govdata`)
      .set('Cookie', finance.cookie)
      .send({ iqamaNumber: '2111111111' })
      .expect(403);
    await request(http())
      .patch(`/employees/${emp.id}`)
      .set('Cookie', finance.cookie)
      .send({ department: 'X' })
      .expect(403); // finance lacks employee.update
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
  });

  it('HR terminates (soft delete → status terminated); recruiter cannot', async () => {
    const emp = await createVia(hr.cookie, baseCreate());
    await request(http()).delete(`/employees/${emp.id}`).set('Cookie', recruiter.cookie).expect(403);
    const res = await request(http()).delete(`/employees/${emp.id}`).set('Cookie', hr.cookie).expect(200);
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
