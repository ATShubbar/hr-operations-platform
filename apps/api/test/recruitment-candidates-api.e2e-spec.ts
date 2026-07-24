import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { VacanciesService } from '../src/modules/recruitment/public-api';
import { cleanupHelperUsers, loginAsClientRep, loginAsStaff, type TestPrincipal } from './helpers/login';

// REC-04: the candidates HTTP API. STAFF-INTERNAL — recruiter does full CRUD +
// pipeline transitions; GRO/Finance can't read recruitment; client reps have no
// access at all (no candidate.* and no client route). The clientId is derived
// from the vacancy server-side.

describe('Candidates API (REC-04, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let clientId: string;
  let vacancyId: string;
  let recruiter: TestPrincipal; // full CRUD + advance
  let gro: TestPrincipal; // no candidate.read
  let rep: TestPrincipal; // client rep — no access
  let candId = '';

  const post = (cookie: string, body: object) =>
    request(http).post('/candidates').set('Cookie', cookie).send(body);
  const stage = (cookie: string, id: string, s: string) =>
    request(http).post(`/candidates/${id}/stage`).set('Cookie', cookie).send({ stage: s });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    http = app.getHttpServer();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    const c = await owner.client.create({
      data: { nameAr: 'شركة المرشحين', nameEn: 'REC-04 Client', status: 'active' },
    });
    clientId = c.id;
    const v = await app.get(VacanciesService).create({ clientId, titleAr: 'محاسب', titleEn: 'Accountant' });
    vacancyId = v.id;
    recruiter = await loginAsStaff(app, 'recruiter');
    gro = await loginAsStaff(app, 'gro_officer');
    rep = await loginAsClientRep(app, clientId, 'client_admin');
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { clientId } });
    // Advancing a candidate to `hired` spawns an employee (REC-05) — clean it up.
    await owner.employee.deleteMany({ where: { clientId } });
    await owner.candidate.deleteMany({ where: { clientId } });
    await owner.vacancy.deleteMany({ where: { id: vacancyId } });
    await cleanupHelperUsers(app);
    await owner.client.delete({ where: { id: clientId } });
    await owner.$disconnect();
    await app.close();
  });

  it('recruiter creates a candidate (applied) — clientId derived from the vacancy', async () => {
    const res = await post(recruiter.cookie, {
      vacancyId,
      name: { ar: 'سالم', en: 'Salem' },
      nationality: 'SA', // required to reach `hired` later (REC-05)
      email: 'salem@example.com',
    }).expect(201);
    expect(res.body.stage).toBe('applied');
    expect(res.body.clientId).toBe(clientId);
    expect(res.body.vacancyId).toBe(vacancyId);
    candId = res.body.id;
  });

  it('rejects a candidate for an unknown vacancy (400)', async () => {
    await post(recruiter.cookie, {
      vacancyId: '00000000-0000-4000-8000-000000000000',
      name: { ar: 'x', en: 'x' },
    }).expect(400);
  });

  it('recruiter updates a candidate', async () => {
    const res = await request(http)
      .patch(`/candidates/${candId}`)
      .set('Cookie', recruiter.cookie)
      .send({ phone: '+966500000000', notes: 'Strong fit' })
      .expect(200);
    expect(res.body.phone).toBe('+966500000000');
    expect(res.body.notes).toBe('Strong fit');
  });

  it('advances the pipeline; rejects illegal jumps', async () => {
    await stage(recruiter.cookie, candId, 'screening').expect(200);
    await stage(recruiter.cookie, candId, 'interview').expect(200);
    // interview → hired skips 'offer' → illegal (400)
    await stage(recruiter.cookie, candId, 'hired').expect(400);
    await stage(recruiter.cookie, candId, 'offer').expect(200);
    const hired = await stage(recruiter.cookie, candId, 'hired').expect(200);
    expect(hired.body.stage).toBe('hired');
    // hired is terminal → any further move is illegal
    await stage(recruiter.cookie, candId, 'withdrawn').expect(400);
  });

  it('filters the list by vacancy and stage', async () => {
    const byVac = await request(http)
      .get(`/candidates?vacancyId=${vacancyId}`)
      .set('Cookie', recruiter.cookie)
      .expect(200);
    expect(byVac.body.candidates.length).toBeGreaterThanOrEqual(1);
    const hiredOnly = await request(http)
      .get(`/candidates?stage=hired`)
      .set('Cookie', recruiter.cookie)
      .expect(200);
    expect(hiredOnly.body.candidates.every((c: { stage: string }) => c.stage === 'hired')).toBe(true);
  });

  it('GRO staff cannot read candidates (403 — candidate.read not granted)', async () => {
    await request(http).get('/candidates').set('Cookie', gro.cookie).expect(403);
  });

  it('a client rep has no access to candidates (403)', async () => {
    await request(http).get('/candidates').set('Cookie', rep.cookie).expect(403);
    await post(rep.cookie, { vacancyId, name: { ar: 'x', en: 'x' } }).expect(403);
  });

  it('rejects unauthenticated callers (401)', async () => {
    await request(http).get('/candidates').expect(401);
  });

  it('recruiter deletes a candidate', async () => {
    const created = await post(recruiter.cookie, { vacancyId, name: { ar: 'ن', en: 'N' } }).expect(201);
    await request(http).delete(`/candidates/${created.body.id}`).set('Cookie', recruiter.cookie).expect(200);
    await request(http).get(`/candidates/${created.body.id}`).set('Cookie', recruiter.cookie).expect(404);
  });
});
