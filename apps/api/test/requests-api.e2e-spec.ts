import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// REQ-02: the dual-path Requests API. The load-bearing property is isolation —
// a client rep may only ever see/create/update their OWN client's requests
// (RLS-enforced), while staff work cross-client. Proven end-to-end here (the
// harness only checks 401-on-unauth).

describe('Requests API (REQ-02, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let clientA: string;
  let clientB: string;
  let admin: TestPrincipal; // enrolled company_admin (staff, CRUD)
  let reader: TestPrincipal; // hr_officer (staff, request.read only)
  let repA: TestPrincipal; // client_admin of A
  let repAUser: TestPrincipal; // client_user of A (create+read, no update)
  let repB: TestPrincipal; // client_admin of B
  let reqA = ''; // a request owned by client A
  let reqB = ''; // a request owned by client B

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    http = app.getHttpServer();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    const cA = await owner.client.create({
      data: { nameAr: 'شركة أ للاختبار', nameEn: 'REQ-02 Client A', status: 'active' },
    });
    const cB = await owner.client.create({
      data: { nameAr: 'شركة ب للاختبار', nameEn: 'REQ-02 Client B', status: 'active' },
    });
    clientA = cA.id;
    clientB = cB.id;
    admin = await loginAsEnrolledStaff(app, 'company_admin');
    reader = await loginAsStaff(app, 'hr_officer');
    repA = await loginAsClientRep(app, clientA, 'client_admin');
    repAUser = await loginAsClientRep(app, clientA, 'client_user');
    repB = await loginAsClientRep(app, clientB, 'client_admin');
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({
      where: { clientId: { in: [clientA, clientB] }, resource: 'request' },
    });
    await owner.request.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await cleanupHelperUsers(app);
    await owner.client.deleteMany({ where: { id: { in: [clientA, clientB] } } });
    await owner.$disconnect();
    await app.close();
  });

  it('client rep creates a request in their OWN client (body clientId is ignored)', async () => {
    const res = await request(http)
      .post('/requests')
      .set('Cookie', repA.cookie)
      .send({ clientId: clientB, type: 'letter', title: 'Salary certificate' }) // tries B
      .expect(201);
    expect(res.body.clientId).toBe(clientA); // forced to the rep's own client
    expect(res.body.status).toBe('open');
    expect(res.body.priority).toBe('normal');
    reqA = res.body.id;
  });

  it('staff creates a request for an explicit client; unknown client → 404', async () => {
    const res = await request(http)
      .post('/requests')
      .set('Cookie', admin.cookie)
      .send({ clientId: clientB, type: 'gro_service', title: 'Iqama renewal', priority: 'high' })
      .expect(201);
    expect(res.body.clientId).toBe(clientB);
    reqB = res.body.id;

    await request(http)
      .post('/requests')
      .set('Cookie', admin.cookie)
      .send({ clientId: randomUUID(), type: 'general', title: 'nowhere' })
      .expect(404);
  });

  it('a client rep lists ONLY their own client’s requests', async () => {
    const a = await request(http).get('/requests').set('Cookie', repA.cookie).expect(200);
    expect(a.body.requests.every((r: { clientId: string }) => r.clientId === clientA)).toBe(true);
    expect(a.body.requests.some((r: { id: string }) => r.id === reqA)).toBe(true);
    expect(a.body.requests.some((r: { id: string }) => r.id === reqB)).toBe(false);

    const b = await request(http).get('/requests').set('Cookie', repB.cookie).expect(200);
    expect(b.body.requests.some((r: { id: string }) => r.id === reqB)).toBe(true);
    expect(b.body.requests.some((r: { id: string }) => r.id === reqA)).toBe(false);
  });

  it('a client rep cannot GET another client’s request (404) but can GET own', async () => {
    await request(http).get(`/requests/${reqB}`).set('Cookie', repA.cookie).expect(404);
    await request(http).get(`/requests/${reqA}`).set('Cookie', repA.cookie).expect(200);
  });

  it('staff read cross-client and can filter by client', async () => {
    const all = await request(http).get('/requests').set('Cookie', reader.cookie).expect(200);
    expect(all.body.requests.some((r: { id: string }) => r.id === reqA)).toBe(true);
    expect(all.body.requests.some((r: { id: string }) => r.id === reqB)).toBe(true);

    const filtered = await request(http)
      .get(`/requests?clientId=${clientA}`)
      .set('Cookie', reader.cookie)
      .expect(200);
    expect(filtered.body.requests.every((r: { clientId: string }) => r.clientId === clientA)).toBe(
      true,
    );
  });

  it('client_admin updates own request; client_user cannot (403); cross-client → 404', async () => {
    const upd = await request(http)
      .patch(`/requests/${reqA}`)
      .set('Cookie', repA.cookie)
      .send({ title: 'Salary certificate (updated)', priority: 'high' })
      .expect(200);
    expect(upd.body.title).toBe('Salary certificate (updated)');
    expect(upd.body.priority).toBe('high');

    await request(http)
      .patch(`/requests/${reqA}`)
      .set('Cookie', repAUser.cookie) // client_user has no request.update
      .send({ title: 'nope' })
      .expect(403);

    await request(http)
      .patch(`/requests/${reqB}`)
      .set('Cookie', repA.cookie) // A editing B's request
      .send({ title: 'cross' })
      .expect(404);
  });

  it('staff update any request', async () => {
    const upd = await request(http)
      .patch(`/requests/${reqB}`)
      .set('Cookie', admin.cookie)
      .send({ priority: 'low' })
      .expect(200);
    expect(upd.body.priority).toBe('low');
  });

  it('rejects unauthenticated callers (401)', async () => {
    await request(http).get('/requests').expect(401);
    await request(http).post('/requests').send({ type: 'general', title: 'x' }).expect(401);
  });
});
