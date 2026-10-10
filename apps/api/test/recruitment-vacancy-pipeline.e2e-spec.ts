import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient, type CandidateStage } from '../src/generated/prisma/client';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// DS-18 (owner decision): a vacancy carries its hiring PIPELINE — how many
// candidates sit at each active stage — so a client manager's Overview can show
// "candidates in progress" and the pipeline bars. Counts ONLY: a client still
// cannot read a single candidate (REC-03; app_client has no grant on
// rec_candidates), and these tests pin that the counts carry nothing else.

const STAGES = ['applied', 'hired', 'interview', 'mobilisation', 'offer', 'screening'];
const CANDIDATE_FIELDS = [
  'nameEn',
  'nameAr',
  'email',
  'phone',
  'nationality',
  'cvDocumentId',
  'notes',
  'stage',
];

describe('Vacancy pipeline counts (DS-18, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let clientA = '';
  let clientB = '';
  let vacA = '';
  let vacA2 = '';
  let vacB = '';
  let staff: TestPrincipal;
  let repA: TestPrincipal;
  let repB: TestPrincipal;

  const seed = (clientId: string, vacancyId: string, stage: CandidateStage, n: number) =>
    owner.candidate.createMany({
      data: Array.from({ length: n }, (_, i) => ({
        clientId,
        vacancyId,
        stage,
        nameAr: 'مرشح',
        nameEn: `DS18-SECRET-NAME-${stage}-${i}`,
        email: `ds18-secret-${stage}-${i}@example.test`,
      })),
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    http = app.getHttpServer();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    clientA = (
      await owner.client.create({ data: { nameAr: 'أ', nameEn: 'DS-18 A', status: 'active' } })
    ).id;
    clientB = (
      await owner.client.create({ data: { nameAr: 'ب', nameEn: 'DS-18 B', status: 'active' } })
    ).id;
    const v = (clientId: string, titleEn: string) =>
      owner.vacancy.create({ data: { clientId, titleAr: 'وظيفة', titleEn, status: 'open' } });
    vacA = (await v(clientA, 'DS-18 role A')).id;
    vacA2 = (await v(clientA, 'DS-18 empty role A')).id;
    vacB = (await v(clientB, 'DS-18 role B')).id;
    // A: 2 applied · 1 interview · 1 hired, plus 1 rejected + 1 withdrawn (off the board).
    await seed(clientA, vacA, 'applied', 2);
    await seed(clientA, vacA, 'interview', 1);
    await seed(clientA, vacA, 'hired', 1);
    await seed(clientA, vacA, 'rejected', 1);
    await seed(clientA, vacA, 'withdrawn', 1);
    // B: 3 at offer — must never show up in A's counts.
    await seed(clientB, vacB, 'offer', 3);

    staff = await loginAsStaff(app, 'hr_officer');
    repA = await loginAsClientRep(app, clientA, 'client_manager');
    repB = await loginAsClientRep(app, clientB, 'client_manager');
  });

  afterAll(async () => {
    await owner.candidate.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await owner.vacancy.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await cleanupHelperUsers(app);
    await owner.client.deleteMany({ where: { id: { in: [clientA, clientB] } } });
    await owner.$disconnect();
    await app.close();
  });

  it("a client manager's vacancies carry the counts per active stage", async () => {
    const res = await request(http).get('/vacancies').set('Cookie', repA.cookie).expect(200);
    const a = res.body.vacancies.find((x: { id: string }) => x.id === vacA);
    expect(a.pipeline).toEqual({
      applied: 2,
      screening: 0,
      interview: 1,
      offer: 0,
      mobilisation: 0,
      hired: 1,
    });
    // A role with nobody on it reads all zeros, not a missing field.
    const empty = res.body.vacancies.find((x: { id: string }) => x.id === vacA2);
    expect(empty.pipeline).toEqual({
      applied: 0,
      screening: 0,
      interview: 0,
      offer: 0,
      mobilisation: 0,
      hired: 0,
    });
  });

  it('the pipeline is exactly the six stage counts (MOB-04b added Visa & mobilisation) — rejected/withdrawn are not stages on the board', async () => {
    const res = await request(http)
      .get(`/vacancies/${vacA}`)
      .set('Cookie', repA.cookie)
      .expect(200);
    expect(Object.keys(res.body.pipeline).sort()).toEqual(STAGES);
    for (const n of Object.values(res.body.pipeline)) expect(typeof n).toBe('number');
  });

  it('nothing about a candidate reaches the client: no names, emails or candidate fields anywhere', async () => {
    const list = await request(http).get('/vacancies').set('Cookie', repA.cookie).expect(200);
    const one = await request(http)
      .get(`/vacancies/${vacA}`)
      .set('Cookie', repA.cookie)
      .expect(200);
    for (const body of [list.text, one.text]) {
      expect(body).not.toContain('DS18-SECRET');
      expect(body).not.toContain('ds18-secret');
      for (const f of CANDIDATE_FIELDS) expect(body).not.toContain(`"${f}"`);
    }
    // And the candidates themselves stay staff-only.
    await request(http).get('/candidates').set('Cookie', repA.cookie).expect(403);
  });

  it("another client's vacancies and counts never appear", async () => {
    const resA = await request(http).get('/vacancies').set('Cookie', repA.cookie).expect(200);
    expect(resA.body.vacancies.map((x: { id: string }) => x.id)).not.toContain(vacB);
    await request(http).get(`/vacancies/${vacB}`).set('Cookie', repA.cookie).expect(404);
    const resB = await request(http).get('/vacancies').set('Cookie', repB.cookie).expect(200);
    expect(resB.body.vacancies.map((x: { id: string }) => x.id)).toEqual([vacB]);
    expect(resB.body.vacancies[0].pipeline).toEqual({
      applied: 0,
      screening: 0,
      interview: 0,
      offer: 3,
      mobilisation: 0,
      hired: 0,
    });
  });

  it('staff see the same counts on every vacancy, and after a write', async () => {
    const res = await request(http)
      .get(`/vacancies?clientId=${clientA}`)
      .set('Cookie', staff.cookie)
      .expect(200);
    const a = res.body.vacancies.find((x: { id: string }) => x.id === vacA);
    expect(a.pipeline).toEqual({
      applied: 2,
      screening: 0,
      interview: 1,
      offer: 0,
      mobilisation: 0,
      hired: 1,
    });
    const upd = await request(http)
      .patch(`/vacancies/${vacA}`)
      .set('Cookie', staff.cookie)
      .send({ department: 'DS-18' })
      .expect(200);
    expect(upd.body.pipeline).toEqual({
      applied: 2,
      screening: 0,
      interview: 1,
      offer: 0,
      mobilisation: 0,
      hired: 1,
    });
  });
});
