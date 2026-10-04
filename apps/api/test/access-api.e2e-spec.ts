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

// DS-21: GET /access — what each role sees on an employee record, for the
// Settings → Access table. Read-only and computed from the rules the API
// enforces (role bundles + the redaction tiers in employee-view.ts), so the
// table cannot claim something the endpoints do not do. The last case checks
// that against the real endpoints.

const SEED_CLIENT_A = '11111111-1111-4111-8111-111111111111';
const ROLES = [
  'administrator',
  'hr_officer',
  'gro_officer',
  'auditor',
  'client_manager',
  'employee',
];
const GROUPS = ['profile', 'expiries', 'identifiers', 'pay', 'clients', 'calendar'];

type Row = { group: string; access: Record<string, string> };

describe('Access API (DS-21, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let hr: TestPrincipal;
  let gro: TestPrincipal;
  let rep: TestPrincipal;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    http = app.getHttpServer();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    hr = await loginAsStaff(app, 'hr_officer');
    gro = await loginAsStaff(app, 'gro_officer');
    rep = await loginAsClientRep(app, SEED_CLIENT_A);
  });

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  const table = async (cookie: string) => {
    const res = await request(http).get('/access').set('Cookie', cookie).expect(200);
    return res.body as { roles: string[]; rows: Row[] };
  };

  it('returns the six roles × six field groups, in order', async () => {
    const body = await table(hr.cookie);
    expect(Object.keys(body).sort()).toEqual(['roles', 'rows']);
    expect(body.roles).toEqual(ROLES);
    expect(body.rows.map((r) => r.group)).toEqual(GROUPS);
    for (const r of body.rows) expect(Object.keys(r.access)).toEqual(ROLES);
  });

  it('says what the rules decide', async () => {
    const body = await table(rep.cookie);
    const cell = Object.fromEntries(body.rows.map((r) => [r.group, r.access]));
    expect(cell.profile).toEqual({
      administrator: 'full',
      hr_officer: 'full',
      gro_officer: 'full',
      auditor: 'full',
      client_manager: 'own_company',
      employee: 'own_record',
    });
    // The portal shows expiry dates and statuses but never identifier numbers.
    expect(cell.expiries!.client_manager).toBe('own_company');
    expect(cell.identifiers!.client_manager).toBe('hidden');
    // No pay visibility for the GRO officer or the client manager.
    expect(cell.pay!.gro_officer).toBe('hidden');
    expect(cell.pay!.client_manager).toBe('hidden');
    expect(cell.pay!.hr_officer).toBe('full');
    // An employee sees their own record in full (ADR-011).
    expect(cell.identifiers!.employee).toBe('own_record');
    expect(cell.pay!.employee).toBe('own_record');
    expect(cell.clients).toEqual({
      administrator: 'full',
      hr_officer: 'full',
      gro_officer: 'full',
      auditor: 'full',
      client_manager: 'own_company',
      employee: 'none',
    });
    expect(cell.calendar!.client_manager).toBe('none');
    expect(cell.calendar!.employee).toBe('none');
  });

  it('agrees with what the employee endpoints actually return', async () => {
    const body = await table(hr.cookie);
    const cell = Object.fromEntries(body.rows.map((r) => [r.group, r.access]));
    const emp = await owner.employee.findFirst({
      where: { clientId: SEED_CLIENT_A, iqamaNumber: { not: null }, basicSalary: { not: null } },
    });
    expect(emp).toBeTruthy();
    const read = async (cookie: string, path: string) =>
      (await request(http).get(path).set('Cookie', cookie).expect(200)).body;

    const asHr = await read(hr.cookie, `/employees/${emp!.id}`);
    expect(asHr.salary !== null).toBe(cell.pay!.hr_officer === 'full');
    expect(asHr.govdata?.iqamaNumber != null).toBe(cell.identifiers!.hr_officer === 'full');

    const asGro = await read(gro.cookie, `/employees/${emp!.id}`);
    expect(asGro.salary !== null).toBe(cell.pay!.gro_officer === 'full');
    expect(asGro.govdata?.iqamaNumber != null).toBe(cell.identifiers!.gro_officer === 'full');
    expect(asGro.govdata?.iqamaExpiry != null).toBe(cell.expiries!.gro_officer === 'full');
  });

  it('an employee is refused, and anonymous gets 401', async () => {
    const employee = await loginAsEmployee(app);
    await request(http).get('/access').set('Cookie', employee.cookie).expect(403);
    await request(http).get('/access').expect(401);
    // The Auditor reads it too (MFA-enrolled full session).
    const auditor = await loginAsEnrolledStaff(app, 'auditor');
    await table(auditor.cookie);
  });
});
