import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { VacanciesService } from '../src/modules/recruitment/public-api';
import { cleanupHelperUsers, loginAsClientRep, loginAsStaff, type TestPrincipal,
  loginAsEnrolledStaff,
} from './helpers/login';

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
  // v1.7 (ADR-013): hiring is an HR officer's (CRU + advance, no delete); the
  // GRO officer reads/updates/advances (visa & mobilisation); delete is the
  // Administrator's alone.
  let recruiter: TestPrincipal; // hr_officer
  let gro: TestPrincipal; // gro_officer — R + U + advance
  let admin: TestPrincipal; // administrator — the only delete
  let rep: TestPrincipal; // client rep — no access
  let candId = '';

  const post = (cookie: string, body: object) =>
    request(http).post('/candidates').set('Cookie', cookie).send(body);
  const stage = (cookie: string, id: string, s: string) =>
    request(http).post(`/candidates/${id}/stage`).set('Cookie', cookie).send({ stage: s });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
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
    recruiter = await loginAsStaff(app, 'hr_officer');
    gro = await loginAsStaff(app, 'gro_officer');
    admin = await loginAsEnrolledStaff(app, 'administrator');
    rep = await loginAsClientRep(app, clientId, 'client_manager');
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

  it('an HR officer creates a candidate (applied) — clientId derived from the vacancy', async () => {
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

  it('an HR officer updates a candidate', async () => {
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

  // DS-09: the board lets a candidate step BACK one stage (owner decision). One
  // step only, never from a terminal stage — `hired` already created an employee.
  it('steps a candidate back one stage; never two, never out of a terminal stage', async () => {
    const created = await post(recruiter.cookie, {
      vacancyId,
      name: { ar: 'رجوع', en: 'Back Step' },
      nationality: 'IN',
    }).expect(201);
    const id = created.body.id as string;
    // applied has nowhere to go back to
    await stage(recruiter.cookie, id, 'applied').expect(400);
    await stage(recruiter.cookie, id, 'screening').expect(200);
    await stage(recruiter.cookie, id, 'applied').expect(200);
    await stage(recruiter.cookie, id, 'screening').expect(200);
    await stage(recruiter.cookie, id, 'interview').expect(200);
    await stage(recruiter.cookie, id, 'offer').expect(200);
    // offer → screening skips interview → illegal
    await stage(recruiter.cookie, id, 'screening').expect(400);
    // the GRO officer holds candidate.advance, so may step back too
    const back = await stage(gro.cookie, id, 'interview').expect(200);
    expect(back.body.stage).toBe('interview');
    await stage(recruiter.cookie, id, 'screening').expect(200);
    // terminal stages stay terminal
    await stage(recruiter.cookie, id, 'rejected').expect(200);
    await stage(recruiter.cookie, id, 'screening').expect(400);
    // hired (candId, from the test above) cannot step back to offer
    await stage(recruiter.cookie, candId, 'offer').expect(400);
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

  it('a GRO officer reads candidates (ADR-013 widening) but cannot create or delete', async () => {
    await request(http).get('/candidates').set('Cookie', gro.cookie).expect(200);
    await post(gro.cookie, { vacancyId, name: { ar: 'ن', en: 'N' } }).expect(403);
    const created = await post(recruiter.cookie, { vacancyId, name: { ar: 'ن', en: 'N' } }).expect(201);
    await request(http).delete(`/candidates/${created.body.id}`).set('Cookie', gro.cookie).expect(403);
  });

  it('a client rep has no access to candidates (403)', async () => {
    await request(http).get('/candidates').set('Cookie', rep.cookie).expect(403);
    await post(rep.cookie, { vacancyId, name: { ar: 'x', en: 'x' } }).expect(403);
  });

  it('rejects unauthenticated callers (401)', async () => {
    await request(http).get('/candidates').expect(401);
  });

  it('delete is the Administrator\'s: an HR officer gets 403, an Administrator deletes', async () => {
    const created = await post(recruiter.cookie, { vacancyId, name: { ar: 'ن', en: 'N' } }).expect(201);
    await request(http).delete(`/candidates/${created.body.id}`).set('Cookie', recruiter.cookie).expect(403);
    await request(http).delete(`/candidates/${created.body.id}`).set('Cookie', admin.cookie).expect(200);
    await request(http).get(`/candidates/${created.body.id}`).set('Cookie', recruiter.cookie).expect(404);
  });
});
