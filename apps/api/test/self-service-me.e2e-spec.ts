import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEmployee,
  loginAsStaff,
} from './helpers/login';

// SS-03 (ADR-011): GET /me — an employee's own file, and nothing else.
//
// Two companies created HERE (one opted in, one not) so the flag state cannot
// race any other spec, and an employee with every sensitive field populated so
// the whitelist is tested against real values, not nulls.

const MARK = 'SS-03-test';

describe('GET /me — employee self-service (SS-03, e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const co = { on: '', off: '' };
  const emp = { me: '', offCompany: '', terminated: '' };

  // One record, one account (SS-01's unique index) — so every test about `me`
  // shares a single session.
  let meSession: Awaited<ReturnType<typeof loginAsEmployee>> | undefined;
  const mine = async () => (meSession ??= await loginAsEmployee(app, emp.me));

  const get = (cookie?: string) => {
    const r = request(app.getHttpServer()).get('/me');
    return cookie ? r.set('Cookie', cookie) : r;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    co.on = (
      await prisma.client.create({ data: { nameAr: 'شركة مفعلة', nameEn: `${MARK} On Co.` } })
    ).id;
    co.off = (
      await prisma.client.create({ data: { nameAr: 'شركة غير مفعلة', nameEn: `${MARK} Off Co.` } })
    ).id;
    await prisma.clientSetting.create({
      data: { clientId: co.on, key: 'flag.employee-self-service', value: true },
    });

    const base = { nameAr: 'أحمد', nationality: 'EG', contractType: 'fixed_term' as const };
    emp.me = (
      await prisma.employee.create({
        data: {
          ...base,
          clientId: co.on,
          nameEn: `${MARK} me`,
          gender: 'male',
          jobTitleAr: 'محاسب',
          jobTitleEn: 'Accountant',
          department: 'Finance',
          basicSalary: 7000,
          housingAllowance: 1750,
          transportAllowance: 700,
          gosiWage: 8750,
          gosiContributionBasis: 'basic_plus_housing',
          bankIban: 'SA03 8000 0000 6080 1016 7519',
          wpsStatus: 'compliant',
          iqamaNumber: '2412345678',
          iqamaExpiry: new Date('2027-05-01'),
          passportNumber: 'A12345678',
          absherServiceRef: 'ABSHER-INTERNAL-REF-SS03',
          countsTowardSaudization: false,
        } as never,
      })
    ).id;
    emp.offCompany = (
      await prisma.employee.create({ data: { ...base, clientId: co.off, nameEn: `${MARK} off` } })
    ).id;
    emp.terminated = (
      await prisma.employee.create({
        data: { ...base, clientId: co.on, nameEn: `${MARK} gone`, employmentStatus: 'terminated' },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.employee.deleteMany({ where: { nameEn: { startsWith: MARK } } });
    await prisma.clientSetting.deleteMany({ where: { clientId: { in: [co.on, co.off] } } });
    await prisma.client.deleteMany({ where: { id: { in: [co.on, co.off] } } });
    await cleanupHelperUsers(app);
    await app.close();
  });

  it('an opted-in employee gets their own file', async () => {
    const me = await mine();
    const body = (await get(me.cookie).expect(200)).body;
    expect(body).toMatchObject({
      id: emp.me,
      name: { ar: 'أحمد', en: `${MARK} me` },
      company: { ar: 'شركة مفعلة', en: `${MARK} On Co.` },
      jobTitle: { en: 'Accountant' },
      employmentStatus: 'active',
      identifiers: { iqamaNumber: '2412345678', passportNumber: 'A12345678' },
      pay: { currency: 'SAR', basicSalary: 7000, housingAllowance: 1750, gosiWage: 8750 },
    });
    expect(body.identifiers.iqamaExpiry).toMatch(/^2027-05-01/);
  });

  // The whitelist, pinned: a field added to the staff shape or to this view must
  // fail here until someone decides it belongs.
  it('returns EXACTLY the agreed fields — nothing more', async () => {
    const me = await mine();
    const body = (await get(me.cookie).expect(200)).body;
    expect(Object.keys(body).sort()).toEqual(
      [
        'company',
        'contractEndDate',
        'contractType',
        'dateOfBirth',
        'department',
        'employmentStatus',
        'gender',
        'hireDate',
        'id',
        'identifiers',
        'jobTitle',
        'name',
        'nationality',
        'pay',
      ].sort(),
    );
    expect(Object.keys(body.identifiers).sort()).toEqual(
      [
        'borderNumber',
        'exitReentryExpiry',
        'exitReentryStatus',
        'gosiRegistrationNumber',
        'gosiRegistrationStatus',
        'iqamaExpiry',
        'iqamaNumber',
        'nationalId',
        'passportExpiry',
        'passportNumber',
        'workPermitExpiry',
        'workPermitNumber',
      ].sort(),
    );
    expect(Object.keys(body.pay).sort()).toEqual(
      [
        'bankIbanLast4',
        'basicSalary',
        'currency',
        'gosiWage',
        'housingAllowance',
        'otherAllowances',
        'transportAllowance',
      ].sort(),
    );
  });

  it("leaves out the employer's working fields, and masks the IBAN to its last 4", async () => {
    const me = await mine();
    const body = (await get(me.cookie).expect(200)).body;
    const raw = JSON.stringify(body);
    expect(body.pay.bankIbanLast4).toBe('7519');
    expect(raw).not.toContain('SA03'); // no part of the IBAN beyond the last 4
    expect(raw).not.toContain('ABSHER-INTERNAL-REF-SS03');
    expect(raw).not.toContain('compliant'); // wpsStatus
    expect(raw).not.toContain('basic_plus_housing'); // gosiContributionBasis
    expect(raw).not.toContain('countsTowardSaudization');
    expect(raw).not.toContain('clientId');
    expect(raw).not.toContain('createdAt');
  });

  it('refuses an employee whose company has NOT opted in (403)', async () => {
    const off = await loginAsEmployee(app, emp.offCompany);
    await get(off.cookie).expect(403);
  });

  it('refuses a terminated employee (403)', async () => {
    const gone = await loginAsEmployee(app, emp.terminated);
    await get(gone.cookie).expect(403);
  });

  it('follows the RECORD, per request: moving the employee to a company that has not opted in shuts /me at once', async () => {
    const moved = await prisma.employee.create({
      data: {
        nameAr: 'منقول',
        nationality: 'IN',
        contractType: 'unlimited',
        clientId: co.on,
        nameEn: `${MARK} moved`,
      },
    });
    const session = await loginAsEmployee(app, moved.id);
    await get(session.cookie).expect(200);
    await prisma.employee.update({ where: { id: moved.id }, data: { clientId: co.off } });
    // Same session, no re-login: the company is read from the record every time.
    await get(session.cookie).expect(403);
  });

  it("an account bound to a record that does not exist gets 404, not someone else's file", async () => {
    const orphan = await loginAsEmployee(app); // random, nonexistent record id
    await get(orphan.cookie).expect(404);
  });

  it('staff and client reps are refused (403) — /me is the employee surface only', async () => {
    const staff = await loginAsStaff(app, 'hr_officer');
    const rep = await loginAsClientRep(app, co.on, 'client_admin');
    await get(staff.cookie).expect(403);
    await get(rep.cookie).expect(403);
  });

  it('unauthenticated → 401', async () => {
    await get().expect(401);
  });
});
