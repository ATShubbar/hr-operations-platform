import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { cleanupHelperUsers, loginAsStaff, type TestPrincipal } from './helpers/login';

// MOB-07 (ADR-018 rev. 3): filing "Iqama issued" or "Medical insurance activated"
// can also record the document's EXPIRY on the person's record — the date is
// known at that moment and was otherwise typed again on the Profile tab.
// Optional; only those two steps take one; nothing else about filing changes.
const MARK = 'MOB-07-test';
const db = () =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });
const day = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
// Everything before "iqama" in the onboarding list, filed — so iqama is READY.
const BEFORE_IQAMA = ['block-visa', 'visa-auth', 'gamca', 'enjaz', 'travel', 'medical-ksa'];
const ALL = [...BEFORE_IQAMA, 'iqama', 'insurance', 'gosi', 'contract', 'bank'];

describe('Filing a step can record an expiry (MOB-07, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let gro: TestPrincipal;
  const ids = { co: '', emp: '', run: '' };

  const http = () => request(app.getHttpServer());
  const file = (key: string, body: object = {}) =>
    http().post(`/gro-sequences/${ids.run}/steps/${key}/file`).set('Cookie', gro.cookie).send(body);
  const record = () => owner.employee.findUniqueOrThrow({ where: { id: ids.emp } });
  const iso = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;
  const stateOf = async (key: string) =>
    (await owner.groSequenceStep.findUniqueOrThrow({ where: { sequenceId_stepKey: { sequenceId: ids.run, stepKey: key } } }))
      .filedOn !== null;

  const cleanup = async () => {
    const clients = (await owner.client.findMany({ where: { nameEn: { startsWith: MARK } } })).map((c) => c.id);
    const where = { clientId: { in: clients } };
    const runs = (await owner.groSequence.findMany({ where })).map((r) => r.id);
    await owner.fee.deleteMany({ where });
    await owner.groSequenceStep.deleteMany({ where: { sequenceId: { in: runs } } });
    await owner.groSequence.deleteMany({ where: { id: { in: runs } } });
    await owner.employee.deleteMany({ where });
    await owner.client.deleteMany({ where: { id: { in: clients } } });
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = db();
    await cleanup();
    gro = await loginAsStaff(app, 'gro_officer');
    ids.co = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} Co` } })).id;
    ids.emp = (
      await owner.employee.create({
        data: { clientId: ids.co, nameAr: 'اختبار', nameEn: `${MARK} a`, nationality: 'IN', contractType: 'unlimited', employmentStatus: 'onboarding' },
      })
    ).id;
    ids.run = (
      await owner.groSequence.create({
        data: {
          clientId: ids.co,
          employeeId: ids.emp,
          kind: 'onboarding',
          startedOn: new Date(`${day(-45)}T00:00:00Z`),
          steps: {
            create: ALL.map((stepKey) =>
              BEFORE_IQAMA.includes(stepKey)
                ? { stepKey, filedOn: new Date(`${day(-10)}T00:00:00Z`), filedByUserId: gro.userId }
                : { stepKey },
            ),
          },
        },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await cleanup();
    await owner.$disconnect();
    await app.close();
  });

  it('says which steps can record a date', async () => {
    const res = await http().get(`/employees/${ids.emp}/sequences`).set('Cookie', gro.cookie).expect(200);
    const steps: { key: string; captures: string | null }[] = res.body.sequences[0].steps;
    expect(Object.fromEntries(steps.filter((s) => s.captures).map((s) => [s.key, s.captures]))).toEqual({
      iqama: 'iqama_expiry',
      insurance: 'insurance_expiry',
    });
  });

  it('refuses a date that is not real, or not after the filing date — and files nothing', async () => {
    await file('iqama', { resultingExpiry: 'next year' }).expect(400);
    await file('iqama', { resultingExpiry: '2027-02-30' }).expect(400);
    await file('iqama', { filedOn: day(-1), resultingExpiry: day(-1) }).expect(400);
    await file('iqama', { filedOn: day(-1), resultingExpiry: day(-200) }).expect(400);
    expect(await stateOf('iqama')).toBe(false);
    expect((await record()).iqamaExpiry).toBeNull();
  });

  it('filing "Iqama issued" with a date records the iqama expiry — audited — and nothing else', async () => {
    await file('iqama', { filedOn: day(-1), resultingExpiry: '2027-10-01' }).expect(200);
    const r = await record();
    expect(iso(r.iqamaExpiry)).toBe('2027-10-01');
    expect(r.medicalInsuranceExpiry).toBeNull();
    expect(r.workPermitExpiry).toBeNull();
    const audit = await owner.auditEntry.findMany({
      where: { resource: 'employee', resourceId: ids.emp, action: 'gro-completion' },
    });
    expect(audit).toHaveLength(1);
  });

  it('filing "Medical insurance activated" with a date records the insurance expiry', async () => {
    await file('insurance', { resultingExpiry: '2027-09-15' }).expect(200);
    const r = await record();
    expect(iso(r.medicalInsuranceExpiry)).toBe('2027-09-15');
    expect(iso(r.iqamaExpiry)).toBe('2027-10-01'); // untouched
  });

  it('a step that records nothing refuses a date, and is not filed by that request', async () => {
    await file('gosi', { resultingExpiry: '2027-09-15' }).expect(400);
    expect(await stateOf('gosi')).toBe(false);
  });

  it('the date is optional: filing without one writes nothing', async () => {
    await owner.employee.update({ where: { id: ids.emp }, data: { medicalInsuranceExpiry: null } });
    // Reopen the insurance step (nothing filed depends on it) and file it bare.
    await http().post(`/gro-sequences/${ids.run}/steps/insurance/reopen`).set('Cookie', gro.cookie).expect(200);
    await file('insurance').expect(200);
    expect((await record()).medicalInsuranceExpiry).toBeNull();
  });

  it('reopening a step leaves the recorded date where it is', async () => {
    await http().post(`/gro-sequences/${ids.run}/steps/insurance/reopen`).set('Cookie', gro.cookie).expect(200);
    // The iqama step has no filed dependents now either.
    await http().post(`/gro-sequences/${ids.run}/steps/iqama/reopen`).set('Cookie', gro.cookie).expect(200);
    expect(iso((await record()).iqamaExpiry)).toBe('2027-10-01');
  });
});
