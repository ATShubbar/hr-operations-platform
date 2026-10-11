import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { EscalationLadderResponse } from '@hr/contracts';
import { dayIn } from '@hr/dates';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEmployee,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// INS-03 (ADR-021 rev. 3): medical insurance and driving licence in the ladder,
// read from the REGISTER for each audience. The rules themselves are proven
// without a database in escalation-ladder.e2e-spec.ts; this proves the dates
// stored on the employee record actually reach them.
const MARK = 'INS-03-test';
const day = (offset: number): Date => {
  const d = dayIn(new Date(), 'Asia/Riyadh');
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};

describe('Insurance and licence in the ladder (INS-03, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let hr: TestPrincipal;
  let rep: TestPrincipal;
  let me: TestPrincipal & { employeeId: string };
  const ids = { co: '', a: '', b: '' };

  const ladder = async (path: string, who: TestPrincipal): Promise<EscalationLadderResponse> =>
    (await request(app.getHttpServer()).get(path).set('Cookie', who.cookie).expect(200)).body;
  const mine = (l: EscalationLadderResponse) =>
    l.items
      .filter((i) => i.key.includes(ids.a) || i.key.includes(ids.b))
      .map((i) => [i.key, i.stage] as const)
      .sort();

  const cleanup = async () => {
    const companies = await owner.client.findMany({ where: { nameEn: { startsWith: MARK } } });
    const where = { clientId: { in: companies.map((c) => c.id) } };
    await owner.groProcess.deleteMany({ where });
    await owner.employee.deleteMany({ where });
    await owner.clientSetting.deleteMany({ where });
    await owner.client.deleteMany({ where: { id: where.clientId } });
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });
    await cleanup();
    ids.co = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} Co` } })).id;
    const person = (name: string, over: object) =>
      owner.employee.create({
        data: { clientId: ids.co, nameAr: 'اختبار', nameEn: `${MARK} ${name}`, nationality: 'IN', contractType: 'unlimited', ...over },
      });
    // a: insurance lapsed two days ago, licence due in five (Escalated).
    ids.a = (await person('a', { medicalInsuranceExpiry: day(-2), drivingLicenceExpiry: day(5) })).id;
    // b: a colleague — insurance in twelve days (Reminder), no licence on file.
    ids.b = (await person('b', { medicalInsuranceExpiry: day(12) })).id;
    await owner.clientSetting.createMany({
      data: [
        { clientId: ids.co, key: 'flag.client-self-service', value: true },
        { clientId: ids.co, key: 'flag.employee-self-service', value: true },
      ],
    });
    hr = await loginAsStaff(app, 'hr_officer');
    rep = await loginAsClientRep(app, ids.co, 'client_manager');
    me = await loginAsEmployee(app, ids.a);
  });

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await cleanup();
    await owner.$disconnect();
    await app.close();
  });

  it('staff: each stored date at its stage, owned by the HR officers; no licence, no item', async () => {
    const l = await ladder('/escalations', hr);
    expect(mine(l)).toEqual(
      [
        [`expiry:${ids.a}:driving_licence`, 'escalation'],
        [`expiry:${ids.a}:medical_insurance`, 'breach'],
        [`expiry:${ids.b}:medical_insurance`, 'reminder'],
      ].sort(),
    );
    const insurance = l.items.find((i) => i.key === `expiry:${ids.a}:medical_insurance`);
    expect(insurance).toMatchObject({
      rule: 'expiry',
      daysLeft: -2,
      subject: { kind: 'document', doc: 'medical_insurance', employee: { id: ids.a } },
      owner: { kind: 'role', role: 'hr_officer' },
      mine: true,
    });
  });

  it('the client manager: only the lapsed insurance', async () => {
    expect(mine(await ladder('/escalations', rep))).toEqual([
      [`expiry:${ids.a}:medical_insurance`, 'breach'],
    ]);
  });

  // INS-04: an open renewal quiets the document for every audience. (Runs last:
  // it changes what the tests above read.)
  it('an open renewal quiets the document — for staff, the client manager and the employee', async () => {
    const proc = await owner.groProcess.create({
      data: { clientId: ids.co, employeeId: ids.a, type: 'medical_insurance_renewal', status: 'in_progress' },
    });
    try {
      const staff = await ladder('/escalations', hr);
      expect(mine(staff).map(([k]) => k)).not.toContain(`expiry:${ids.a}:medical_insurance`);
      expect(mine(staff).map(([k]) => k)).toContain(`expiry:${ids.a}:driving_licence`);
      expect(mine(staff).map(([k]) => k)).toContain(`expiry:${ids.b}:medical_insurance`);
      expect(mine(await ladder('/escalations', rep))).toEqual([]);
      expect(mine(await ladder('/me/escalations', me))).toEqual([
        [`expiry:${ids.a}:driving_licence`, 'escalation'],
      ]);
    } finally {
      await owner.groProcess.delete({ where: { id: proc.id } });
    }
  });

  it('the employee: both of their own, nothing of the colleague', async () => {
    expect(mine(await ladder('/me/escalations', me))).toEqual(
      [
        [`expiry:${ids.a}:driving_licence`, 'escalation'],
        [`expiry:${ids.a}:medical_insurance`, 'breach'],
      ].sort(),
    );
  });
});
