import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// CLIENT-03: client portal user management. A Client Admin manages ONLY its own
// client's client_rep users; identity lives in auth_users (app-scoped, no RLS).

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const CLIENT_B = '22222222-2222-4222-8222-222222222222';
const MARK = 'cu-test-';

interface UserBody {
  id: string;
  email: string;
  role: 'client_admin' | 'client_user';
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
}

describe('Client portal user management (CLIENT-03, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let adminA: TestPrincipal; // client_admin @ A
  let adminB: TestPrincipal; // client_admin @ B
  let userA: TestPrincipal; // client_user @ A (lacks client-user.*)
  let staff: TestPrincipal; // hr_officer (no client-user perms, no client scope)

  const http = () => app.getHttpServer();

  async function invite(
    cookie: string,
    role: 'client_admin' | 'client_user' = 'client_user',
  ): Promise<UserBody> {
    const res = await request(http())
      .post('/client-users')
      .set('Cookie', cookie)
      .send({ email: `${MARK}${randomUUID()}@example.com`, password: 'invite-pw-12345', role })
      .expect(201);
    return res.body as UserBody;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    adminA = await loginAsClientRep(app, CLIENT_A, 'client_admin');
    adminB = await loginAsClientRep(app, CLIENT_B, 'client_admin');
    userA = await loginAsClientRep(app, CLIENT_A, 'client_user');
    staff = await loginAsStaff(app, 'hr_officer');
    await owner.auditEntry.deleteMany({ where: { resource: 'client-user' } });
    await owner.authUser.deleteMany({ where: { email: { startsWith: MARK } } });
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { resource: 'client-user' } });
    await owner.authUser.deleteMany({ where: { email: { startsWith: MARK } } });
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('unauthenticated → 401', async () => {
    await request(http()).get('/client-users').expect(401);
    await request(http()).post('/client-users').send({}).expect(401);
  });

  it('Client Admin invites a client user → 201, safe response shape', async () => {
    const body = await invite(adminA.cookie, 'client_user');
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.role).toBe('client_user');
    expect(body.status).toBe('active');
    // No secret material leaks.
    expect(JSON.stringify(body)).not.toMatch(/password|hash|mfa/i);
  });

  it('list + get are scoped to the admin’s own client', async () => {
    const created = await invite(adminA.cookie);
    const list = await request(http()).get('/client-users').set('Cookie', adminA.cookie).expect(200);
    expect((list.body.users as UserBody[]).some((u) => u.id === created.id)).toBe(true);

    const got = await request(http())
      .get(`/client-users/${created.id}`)
      .set('Cookie', adminA.cookie)
      .expect(200);
    expect((got.body as UserBody).id).toBe(created.id);
  });

  it('ISOLATION: a Client Admin cannot see or touch another client’s users', async () => {
    const userInB = await invite(adminB.cookie);

    // Not in A's list.
    const listA = await request(http()).get('/client-users').set('Cookie', adminA.cookie).expect(200);
    expect((listA.body.users as UserBody[]).some((u) => u.id === userInB.id)).toBe(false);

    // get / update / deactivate across clients → 404 (never reveals existence).
    await request(http())
      .get(`/client-users/${userInB.id}`)
      .set('Cookie', adminA.cookie)
      .expect(404);
    await request(http())
      .patch(`/client-users/${userInB.id}`)
      .set('Cookie', adminA.cookie)
      .send({ status: 'disabled' })
      .expect(404);
    await request(http())
      .delete(`/client-users/${userInB.id}`)
      .set('Cookie', adminA.cookie)
      .expect(404);

    // B's user is untouched.
    expect((await owner.authUser.findUnique({ where: { id: userInB.id } }))?.status).toBe('active');
  });

  it('update role/status and deactivate (soft)', async () => {
    const created = await invite(adminA.cookie, 'client_user');
    const promoted = await request(http())
      .patch(`/client-users/${created.id}`)
      .set('Cookie', adminA.cookie)
      .send({ role: 'client_admin' })
      .expect(200);
    expect((promoted.body as UserBody).role).toBe('client_admin');

    const deactivated = await request(http())
      .delete(`/client-users/${created.id}`)
      .set('Cookie', adminA.cookie)
      .expect(200);
    expect((deactivated.body as UserBody).status).toBe('disabled');
    // Soft: the user row still exists.
    expect(await owner.authUser.count({ where: { id: created.id } })).toBe(1);
  });

  it('a plain Client User (no client-user perms) → 403', async () => {
    await request(http()).get('/client-users').set('Cookie', userA.cookie).expect(403);
    await request(http())
      .post('/client-users')
      .set('Cookie', userA.cookie)
      .send({ email: `${MARK}x@example.com`, password: 'invite-pw-12345', role: 'client_user' })
      .expect(403);
  });

  it('staff have no client-user permission → 403', async () => {
    await request(http()).get('/client-users').set('Cookie', staff.cookie).expect(403);
  });

  it('duplicate email → 400', async () => {
    const first = await invite(adminA.cookie);
    await request(http())
      .post('/client-users')
      .set('Cookie', adminA.cookie)
      .send({ email: first.email, password: 'invite-pw-12345', role: 'client_user' })
      .expect(400);
  });

  it('mutations are audited (create + update + deactivate), scoped to the client', async () => {
    const created = await invite(adminA.cookie, 'client_user');
    await request(http())
      .patch(`/client-users/${created.id}`)
      .set('Cookie', adminA.cookie)
      .send({ role: 'client_admin' })
      .expect(200);
    await request(http())
      .delete(`/client-users/${created.id}`)
      .set('Cookie', adminA.cookie)
      .expect(200);

    // The audit rows for this invited user: filter by the actor + client, then
    // the create/update/deactivate actions must all be present.
    const entries = await owner.auditEntry.findMany({
      where: { resource: 'client-user', clientId: CLIENT_A, actorId: adminA.userId },
      orderBy: { id: 'asc' },
    });
    const actions = entries.map((e) => e.action);
    expect(actions).toContain('create');
    expect(actions).toContain('update');
    expect(actions).toContain('deactivate');
    expect(entries.every((e) => e.actorRole === 'client_admin')).toBe(true);
  });
});
