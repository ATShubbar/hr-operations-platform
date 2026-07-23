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
  type TestPrincipal,
} from './helpers/login';

// REQ-03: request processing. Staff advance the status workflow; an accepted
// transition notifies the creator via the RequestStatusChanged domain event
// (Requests → events bus → Notifications). Illegal transitions 400; client reps
// cannot process. Requests never imports Notifications (enforced by lint/build).

describe('Request processing (REQ-03, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let clientA: string;
  let admin: TestPrincipal; // enrolled company_admin — request.process
  let rep: TestPrincipal; // client_admin of A — the creator; no request.process

  const createOpenRequest = async (): Promise<string> => {
    const res = await request(http)
      .post('/requests')
      .set('Cookie', rep.cookie)
      .send({ type: 'letter', title: 'Salary certificate' })
      .expect(201);
    return res.body.id as string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    http = app.getHttpServer();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    const c = await owner.client.create({
      data: { nameAr: 'شركة الطلبات', nameEn: 'REQ-03 Client', status: 'active' },
    });
    clientA = c.id;
    admin = await loginAsEnrolledStaff(app, 'company_admin');
    rep = await loginAsClientRep(app, clientA, 'client_admin');
  });

  afterAll(async () => {
    await owner.notification.deleteMany({ where: { recipientUserId: rep.userId } });
    await owner.auditEntry.deleteMany({ where: { clientId: clientA, resource: 'request' } });
    await owner.request.deleteMany({ where: { clientId: clientA } });
    await cleanupHelperUsers(app);
    await owner.client.deleteMany({ where: { id: clientA } });
    await owner.$disconnect();
    await app.close();
  });

  it('staff advance status through legal transitions, set the assignee, and notify the creator', async () => {
    const id = await createOpenRequest();

    const p1 = await request(http)
      .post(`/requests/${id}/process`)
      .set('Cookie', admin.cookie)
      .send({ status: 'in_progress', assigneeUserId: admin.userId })
      .expect(200);
    expect(p1.body.status).toBe('in_progress');
    expect(p1.body.assigneeUserId).toBe(admin.userId);

    // the creator was notified (via the domain event → Notifications handler)
    const notifs = await owner.notification.findMany({
      where: { recipientUserId: rep.userId, data: { path: ['requestId'], equals: id } },
    });
    expect(notifs.length).toBe(1);
    expect(notifs[0]?.category).toBe('request');
    expect(notifs[0]?.titleEn).toBe('Request updated: In progress');

    // continue the workflow
    await request(http)
      .post(`/requests/${id}/process`)
      .set('Cookie', admin.cookie)
      .send({ status: 'resolved' })
      .expect(200);
    const p3 = await request(http)
      .post(`/requests/${id}/process`)
      .set('Cookie', admin.cookie)
      .send({ status: 'closed' })
      .expect(200);
    expect(p3.body.status).toBe('closed');
  });

  it('rejects an illegal transition (400)', async () => {
    const id = await createOpenRequest();
    await request(http)
      .post(`/requests/${id}/process`)
      .set('Cookie', admin.cookie)
      .send({ status: 'closed' }) // open → closed is not a legal edge
      .expect(400);
  });

  it('client reps cannot process (403) and an unknown id is 404', async () => {
    const id = await createOpenRequest();
    await request(http)
      .post(`/requests/${id}/process`)
      .set('Cookie', rep.cookie) // client_admin lacks request.process
      .send({ status: 'in_progress' })
      .expect(403);
    await request(http)
      .post(`/requests/${randomUUID()}/process`)
      .set('Cookie', admin.cookie)
      .send({ status: 'in_progress' })
      .expect(404);
  });
});
