import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { VacanciesService } from '../src/modules/recruitment/public-api';
import {
  cleanupHelperUsers,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// SOON-04: a candidate's TARGET DATE — optional, set when the candidate is added
// and changed afterwards. It is a day, not an instant. Health is worked out from
// it by the screens (candidate-health, @hr/contracts); the API stores the date.

describe('Candidate target date (SOON-04, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let clientId: string;
  let vacancyId: string;
  let hr: TestPrincipal;
  let gro: TestPrincipal;
  let auditor: TestPrincipal;

  const add = (who: TestPrincipal, extra: object = {}) =>
    request(http)
      .post('/candidates')
      .set('Cookie', who.cookie)
      .send({ vacancyId, name: { ar: 'مرشح', en: 'Target Test' }, ...extra });
  const patch = (who: TestPrincipal, id: string, body: object) =>
    request(http).patch(`/candidates/${id}`).set('Cookie', who.cookie).send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    http = app.getHttpServer();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    clientId = (
      await owner.client.create({
        data: { nameAr: 'شركة الهدف', nameEn: `SOON-04 Client ${Date.now()}`, status: 'active' },
      })
    ).id;
    vacancyId = (
      await app.get(VacanciesService).create({ clientId, titleAr: 'محاسب', titleEn: 'Accountant' })
    ).id;
    hr = await loginAsStaff(app, 'hr_officer');
    gro = await loginAsStaff(app, 'gro_officer');
    auditor = await loginAsEnrolledStaff(app, 'auditor');
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { clientId } });
    await owner.candidate.deleteMany({ where: { clientId } });
    await owner.vacancy.deleteMany({ where: { clientId } });
    await cleanupHelperUsers(app);
    await owner.client.deleteMany({ where: { id: clientId } });
    await owner.$disconnect();
    await app.close();
  });

  it('a candidate added without one has no target date', async () => {
    const res = await add(hr).expect(201);
    expect(res.body.targetDate).toBeNull();
  });

  it('is stored as the day it was given, and comes back the same from every read', async () => {
    const id = (await add(hr, { targetDate: '2026-11-30' }).expect(201)).body.id as string;
    const one = await request(http).get(`/candidates/${id}`).set('Cookie', hr.cookie).expect(200);
    expect(one.body.targetDate).toBe('2026-11-30');
    const list = await request(http)
      .get(`/candidates?vacancyId=${vacancyId}`)
      .set('Cookie', auditor.cookie)
      .expect(200);
    expect(list.body.candidates.find((c: { id: string }) => c.id === id).targetDate).toBe(
      '2026-11-30',
    );
    // A day, not an instant: nothing has shifted it across midnight.
    const row = await owner.candidate.findUniqueOrThrow({ where: { id } });
    expect(row.targetDate?.toISOString().slice(0, 10)).toBe('2026-11-30');
  });

  it('can be changed and cleared — by the people who may edit a candidate', async () => {
    const id = (await add(hr, { targetDate: '2026-11-30' }).expect(201)).body.id as string;
    expect((await patch(gro, id, { targetDate: '2026-12-15' }).expect(200)).body.targetDate).toBe(
      '2026-12-15',
    );
    // Another field's edit leaves it alone.
    expect((await patch(hr, id, { notes: 'Visa in hand' }).expect(200)).body.targetDate).toBe(
      '2026-12-15',
    );
    expect((await patch(hr, id, { targetDate: null }).expect(200)).body.targetDate).toBeNull();
    // The Auditor reads; they do not change.
    await patch(auditor, id, { targetDate: '2026-12-20' }).expect(403);
  });

  it('refuses a value that is not a real day', async () => {
    for (const bad of ['2026-02-30', '30/11/2026', '2026-11-30T10:00:00Z', '', 20261130]) {
      await add(hr, { targetDate: bad }).expect(400);
    }
    const id = (await add(hr).expect(201)).body.id as string;
    await patch(hr, id, { targetDate: '2026-13-01' }).expect(400);
  });

  it('a change is written to the audit trail as a candidate update', async () => {
    const id = (await add(hr).expect(201)).body.id as string;
    const before = await owner.auditEntry.count({
      where: { resource: 'candidate', action: 'update', clientId },
    });
    await patch(hr, id, { targetDate: '2026-12-01' }).expect(200);
    expect(
      await owner.auditEntry.count({
        where: { resource: 'candidate', action: 'update', clientId },
      }),
    ).toBe(before + 1);
  });
});
