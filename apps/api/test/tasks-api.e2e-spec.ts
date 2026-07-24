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
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// TASK-02: the Tasks API. The load-bearing property is the matrix "own/assigned"
// scope — a non-admin staff member sees/acts on only tasks they created or are
// assigned to, while task.read-all holders (admins + read-only) see everything.

describe('Tasks API (TASK-02, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let http: ReturnType<INestApplication['getHttpServer']>;
  const clientId = randomUUID(); // synthetic tag for cleanup
  let admin: TestPrincipal; // company_admin — read-all + create/update/delete
  let gro: TestPrincipal; // gro_officer — create/update, own/assigned only
  let hr: TestPrincipal; // hr_officer — create/update, own/assigned only
  let reader: TestPrincipal; // read_only — read-all, no writes
  let t1 = ''; // created by gro
  let t2 = ''; // created by admin, assigned to hr

  const idsOf = (body: { tasks: { id: string }[] }) => body.tasks.map((t) => t.id);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    http = app.getHttpServer();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    admin = await loginAsEnrolledStaff(app, 'company_admin');
    gro = await loginAsStaff(app, 'gro_officer');
    hr = await loginAsStaff(app, 'hr_officer');
    reader = await loginAsStaff(app, 'read_only');
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { clientId, resource: 'task' } });
    await owner.task.deleteMany({ where: { clientId } });
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('creates a task; own/assigned scope hides it from other non-admins but not admins', async () => {
    const res = await request(http)
      .post('/tasks')
      .set('Cookie', gro.cookie)
      .send({ clientId, title: 'GRO task' })
      .expect(201);
    t1 = res.body.id;
    expect(res.body.createdByUserId).toBe(gro.userId);

    expect(idsOf((await request(http).get('/tasks').set('Cookie', gro.cookie).expect(200)).body)).toContain(t1);
    expect(idsOf((await request(http).get('/tasks').set('Cookie', hr.cookie).expect(200)).body)).not.toContain(t1);
    expect(idsOf((await request(http).get('/tasks').set('Cookie', admin.cookie).expect(200)).body)).toContain(t1);
  });

  it('an assignee sees their assigned task', async () => {
    const res = await request(http)
      .post('/tasks')
      .set('Cookie', admin.cookie)
      .send({ clientId, title: 'For HR', assigneeUserId: hr.userId })
      .expect(201);
    t2 = res.body.id;

    expect(idsOf((await request(http).get('/tasks').set('Cookie', hr.cookie).expect(200)).body)).toContain(t2);
    expect(idsOf((await request(http).get('/tasks').set('Cookie', gro.cookie).expect(200)).body)).not.toContain(t2);
  });

  it('a non-admin cannot GET/PATCH a task outside their scope (404) but can act on own', async () => {
    await request(http).get(`/tasks/${t1}`).set('Cookie', hr.cookie).expect(404);
    await request(http)
      .patch(`/tasks/${t1}`)
      .set('Cookie', hr.cookie)
      .send({ status: 'done' })
      .expect(404);

    const upd = await request(http)
      .patch(`/tasks/${t1}`)
      .set('Cookie', gro.cookie) // gro owns t1
      .send({ status: 'in_progress' })
      .expect(200);
    expect(upd.body.status).toBe('in_progress');
  });

  it('read_only sees all tasks but cannot create or update (403)', async () => {
    await request(http).get(`/tasks/${t1}`).set('Cookie', reader.cookie).expect(200);
    await request(http).post('/tasks').set('Cookie', reader.cookie).send({ title: 'x' }).expect(403);
    await request(http)
      .patch(`/tasks/${t1}`)
      .set('Cookie', reader.cookie)
      .send({ status: 'done' })
      .expect(403);
  });

  it('delete is company_admin only', async () => {
    await request(http).delete(`/tasks/${t1}`).set('Cookie', gro.cookie).expect(403); // no task.delete
    await request(http).delete(`/tasks/${t2}`).set('Cookie', admin.cookie).expect(200);
    await request(http).get(`/tasks/${t2}`).set('Cookie', admin.cookie).expect(404); // gone
  });

  it('rejects unauthenticated callers (401)', async () => {
    await request(http).get('/tasks').expect(401);
    await request(http).post('/tasks').send({ title: 'x' }).expect(401);
  });
});
