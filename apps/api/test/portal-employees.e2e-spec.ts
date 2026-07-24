import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { cleanupHelperUsers, loginAsClientRep, loginAsStaff, type TestPrincipal } from './helpers/login';

// PORTAL-02: a client rep reads their OWN employees through the portal, redacted
// to core + govdata:status — salary is null and the government IDENTIFIER
// numbers are null, but the expiry/status fields ARE visible. Cross-client and
// unknown ids are 404 (existence never leaked); staff lack portal.read (403);
// the whole surface is gated by flag.client-self-service.

const FLAG = 'flag.client-self-service';

describe('Client portal — /portal/employees (PORTAL-02, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let clientA: string;
  let clientB: string;
  let empA: string;
  let empB: string;
  let repA: TestPrincipal;
  let repB: TestPrincipal;
  let staff: TestPrincipal;

  const setFlag = (clientId: string, on: boolean) =>
    owner.clientSetting.upsert({
      where: { clientId_key: { clientId, key: FLAG } },
      create: { clientId, key: FLAG, value: on },
      update: { value: on },
    });

  // A fully-populated employee — every sensitive field set, so redaction is
  // provable by asserting the sensitive ones come back null while the status
  // ones survive.
  const seedEmployee = (clientId: string, nameEn: string) =>
    owner.employee.create({
      data: {
        clientId,
        nameAr: 'موظف',
        nameEn,
        nationality: 'SA',
        contractType: 'unlimited',
        employmentStatus: 'active',
        // salary
        basicSalary: 12000,
        housingAllowance: 3000,
        bankIban: 'SA0380000000608010167519',
        wpsStatus: 'compliant',
        // govdata identifiers (must be redacted for the portal)
        iqamaNumber: '2123456789',
        nationalId: '1123456789',
        passportNumber: 'A12345678',
        workPermitNumber: 'WP-99',
        gosiRegistrationNumber: 'GOSI-1',
        absherServiceRef: 'ABSHER-1',
        // govdata status/expiry (must be visible to the portal)
        iqamaExpiry: new Date('2027-01-01'),
        workPermitExpiry: new Date('2027-02-01'),
        exitReentryStatus: 'single',
        gosiRegistrationStatus: 'registered',
      },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    http = app.getHttpServer();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    const cA = await owner.client.create({
      data: { nameAr: 'شركة أ للموظفين', nameEn: 'PORTAL-EMP Client A', status: 'active' },
    });
    const cB = await owner.client.create({
      data: { nameAr: 'شركة ب للموظفين', nameEn: 'PORTAL-EMP Client B', status: 'active' },
    });
    clientA = cA.id;
    clientB = cB.id;
    empA = (await seedEmployee(clientA, 'Alice A')).id;
    empB = (await seedEmployee(clientB, 'Bob B')).id;
    repA = await loginAsClientRep(app, clientA, 'client_admin');
    repB = await loginAsClientRep(app, clientB, 'client_user');
    staff = await loginAsStaff(app, 'hr_officer');
  });

  afterAll(async () => {
    await owner.employee.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await owner.clientSetting.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await cleanupHelperUsers(app);
    await owner.client.deleteMany({ where: { id: { in: [clientA, clientB] } } });
    await owner.$disconnect();
    await app.close();
  });

  it('is blocked (403) while flag.client-self-service is off', async () => {
    await request(http).get('/portal/employees').set('Cookie', repA.cookie).expect(403);
  });

  it('lists ONLY the caller own client employees, redacted', async () => {
    await setFlag(clientA, true);
    await setFlag(clientB, true);

    const a = await request(http).get('/portal/employees').set('Cookie', repA.cookie).expect(200);
    expect(a.body.employees).toHaveLength(1);
    const [row] = a.body.employees;
    expect(row.id).toBe(empA);
    expect(row.clientId).toBe(clientA);
    // core is present
    expect(row.name.en).toBe('Alice A');
    // salary redacted entirely
    expect(row.salary).toBeNull();
    // govdata: identifiers redacted, status/expiry visible
    expect(row.govdata).not.toBeNull();
    expect(row.govdata.iqamaNumber).toBeNull();
    expect(row.govdata.nationalId).toBeNull();
    expect(row.govdata.passportNumber).toBeNull();
    expect(row.govdata.gosiRegistrationNumber).toBeNull();
    expect(row.govdata.absherServiceRef).toBeNull();
    expect(row.govdata.iqamaExpiry).toBe('2027-01-01T00:00:00.000Z');
    expect(row.govdata.exitReentryStatus).toBe('single');
    expect(row.govdata.gosiRegistrationStatus).toBe('registered');

    // rep B sees only their own
    const b = await request(http).get('/portal/employees').set('Cookie', repB.cookie).expect(200);
    expect(b.body.employees).toHaveLength(1);
    expect(b.body.employees[0].id).toBe(empB);
  });

  it('GET :id returns the own employee, redacted', async () => {
    const res = await request(http)
      .get(`/portal/employees/${empA}`)
      .set('Cookie', repA.cookie)
      .expect(200);
    expect(res.body.id).toBe(empA);
    expect(res.body.salary).toBeNull();
    expect(res.body.govdata.iqamaNumber).toBeNull();
    expect(res.body.govdata.iqamaExpiry).toBe('2027-01-01T00:00:00.000Z');
  });

  it('GET :id for another client employee is 404 (existence not leaked)', async () => {
    await request(http)
      .get(`/portal/employees/${empB}`)
      .set('Cookie', repA.cookie)
      .expect(404);
  });

  it('GET :id for an unknown id is 404', async () => {
    await request(http)
      .get('/portal/employees/00000000-0000-4000-8000-000000000000')
      .set('Cookie', repA.cookie)
      .expect(404);
  });

  it('is client-only — staff lack portal.read (403)', async () => {
    await request(http).get('/portal/employees').set('Cookie', staff.cookie).expect(403);
  });

  it('rejects unauthenticated callers (401)', async () => {
    await request(http).get('/portal/employees').expect(401);
    await request(http).get(`/portal/employees/${empA}`).expect(401);
  });
});
