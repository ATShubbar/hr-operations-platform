import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { cleanupHelperUsers, loginAsClientRep, loginAsStaff, type TestPrincipal } from './helpers/login';

// REC-02: the vacancies HTTP API. Asymmetric dual-path — staff (recruiter) do full
// CRUD + the vacancy.approve status workflow across clients; client reps only READ
// their OWN client's vacancies; GRO/Finance staff can't see recruitment at all.

describe('Vacancies API (REC-02, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let clientA: string;
  let clientB: string;
  let recruiter: TestPrincipal; // staff, full vacancy CRUD + approve
  let gro: TestPrincipal; // staff WITHOUT vacancy.read
  let repA: TestPrincipal; // client_admin of A (read own)
  let repB: TestPrincipal; // client_user of B (read own)
  let vacA = ''; // a vacancy owned by client A
  let vacB = ''; // a vacancy owned by client B

  const post = (cookie: string, body: object) =>
    request(http).post('/vacancies').set('Cookie', cookie).send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    http = app.getHttpServer();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    const cA = await owner.client.create({
      data: { nameAr: 'شركة أ للتوظيف', nameEn: 'REC-02 Client A', status: 'active' },
    });
    const cB = await owner.client.create({
      data: { nameAr: 'شركة ب للتوظيف', nameEn: 'REC-02 Client B', status: 'active' },
    });
    clientA = cA.id;
    clientB = cB.id;
    recruiter = await loginAsStaff(app, 'recruiter');
    gro = await loginAsStaff(app, 'gro_officer');
    repA = await loginAsClientRep(app, clientA, 'client_admin');
    repB = await loginAsClientRep(app, clientB, 'client_user');
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { resource: 'vacancy', clientId: { in: [clientA, clientB] } } });
    await owner.vacancy.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await cleanupHelperUsers(app);
    await owner.client.deleteMany({ where: { id: { in: [clientA, clientB] } } });
    await owner.$disconnect();
    await app.close();
  });

  it('recruiter creates vacancies (draft) for either client', async () => {
    const a = await post(recruiter.cookie, {
      clientId: clientA,
      title: { ar: 'محاسب', en: 'Accountant' },
      department: 'Finance',
    }).expect(201);
    expect(a.body.status).toBe('draft');
    expect(a.body.title.en).toBe('Accountant');
    expect(a.body.clientId).toBe(clientA);
    vacA = a.body.id;

    const b = await post(recruiter.cookie, {
      clientId: clientB,
      title: { ar: 'مهندس', en: 'Engineer' },
    }).expect(201);
    vacB = b.body.id;
  });

  it('rejects create for an unknown client (404)', async () => {
    await post(recruiter.cookie, {
      clientId: '00000000-0000-4000-8000-000000000000',
      title: { ar: 'x', en: 'x' },
    }).expect(404);
  });

  it('recruiter updates a vacancy', async () => {
    const res = await request(http)
      .patch(`/vacancies/${vacA}`)
      .set('Cookie', recruiter.cookie)
      .send({ headcount: 3, department: 'Finance & Ops' })
      .expect(200);
    expect(res.body.headcount).toBe(3);
    expect(res.body.department).toBe('Finance & Ops');
  });

  it('advances status along the workflow; rejects an illegal transition', async () => {
    // draft → open
    const opened = await request(http)
      .post(`/vacancies/${vacA}/status`)
      .set('Cookie', recruiter.cookie)
      .send({ status: 'open' })
      .expect(200);
    expect(opened.body.status).toBe('open');

    // open → draft is illegal → 400
    await request(http)
      .post(`/vacancies/${vacA}/status`)
      .set('Cookie', recruiter.cookie)
      .send({ status: 'draft' })
      .expect(400);

    // open → filled is legal
    await request(http)
      .post(`/vacancies/${vacA}/status`)
      .set('Cookie', recruiter.cookie)
      .send({ status: 'filled' })
      .expect(200);
  });

  it('a client rep reads ONLY their own client vacancies', async () => {
    const a = await request(http).get('/vacancies').set('Cookie', repA.cookie).expect(200);
    const idsA = a.body.vacancies.map((v: { id: string }) => v.id);
    expect(idsA).toContain(vacA);
    expect(idsA).not.toContain(vacB);

    // rep A cannot fetch client B's vacancy by id → 404 (RLS hides it)
    await request(http).get(`/vacancies/${vacB}`).set('Cookie', repA.cookie).expect(404);
    // rep B sees their own
    const b = await request(http).get('/vacancies').set('Cookie', repB.cookie).expect(200);
    expect(b.body.vacancies.map((v: { id: string }) => v.id)).toEqual([vacB]);
  });

  it('a client rep cannot write vacancies (403)', async () => {
    await post(repA.cookie, { clientId: clientA, title: { ar: 'x', en: 'x' } }).expect(403);
    await request(http)
      .patch(`/vacancies/${vacA}`)
      .set('Cookie', repA.cookie)
      .send({ headcount: 9 })
      .expect(403);
    await request(http)
      .post(`/vacancies/${vacA}/status`)
      .set('Cookie', repA.cookie)
      .send({ status: 'closed' })
      .expect(403);
    await request(http).delete(`/vacancies/${vacA}`).set('Cookie', repA.cookie).expect(403);
  });

  it('GRO staff cannot read recruitment (403 — vacancy.read not granted)', async () => {
    await request(http).get('/vacancies').set('Cookie', gro.cookie).expect(403);
  });

  it('rejects unauthenticated callers (401)', async () => {
    await request(http).get('/vacancies').expect(401);
  });

  it('recruiter deletes a vacancy', async () => {
    await request(http).delete(`/vacancies/${vacB}`).set('Cookie', recruiter.cookie).expect(200);
    await request(http).get(`/vacancies/${vacB}`).set('Cookie', recruiter.cookie).expect(404);
  });
});
