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
  loginAsEmployee,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// ROLE-02/03 (ADR-013): Administrators manage ANY client's portal users over a
// STAFF path, `/clients/:clientId/users` — the only path since ROLE-03 retired
// the client-rep one. The company comes from the PATH. One client role exists
// (client_manager), so an invitation carries no role and the only change is
// status. The Auditor reads (matrix: R); nobody else gets anything.

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const CLIENT_B = '22222222-2222-4222-8222-222222222222';
const NO_SUCH_CLIENT = 'c0ffee00-0000-4000-8000-000000000000';
const MARK = 'cpu-test-';
const PASSWORD = 'invite-pw-12345';

interface UserBody {
  id: string;
  email: string;
  role: 'client_manager';
  status: 'active' | 'disabled';
}

describe('Client portal users — staff path (ROLE-02/03, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let admin: TestPrincipal;
  let auditor: TestPrincipal;
  let hrOfficer: TestPrincipal;
  let groOfficer: TestPrincipal;
  let managerA: TestPrincipal;
  let employee: TestPrincipal;

  const http = () => app.getHttpServer();
  const base = (clientId: string) => `/clients/${clientId}/users`;
  const newUser = () => ({ email: `${MARK}${randomUUID()}@example.com`, password: PASSWORD });

  async function invite(cookie: string, clientId: string): Promise<UserBody> {
    const res = await request(http())
      .post(base(clientId))
      .set('Cookie', cookie)
      .send(newUser())
      .expect(201);
    return res.body as UserBody;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    admin = await loginAsEnrolledStaff(app, 'administrator');
    auditor = await loginAsEnrolledStaff(app, 'auditor');
    hrOfficer = await loginAsStaff(app, 'hr_officer');
    groOfficer = await loginAsStaff(app, 'gro_officer');
    managerA = await loginAsClientRep(app, CLIENT_A, 'client_manager');
    employee = await loginAsEmployee(app);
  });

  afterAll(async () => {
    await owner.authUser.deleteMany({ where: { email: { startsWith: MARK } } });
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('unauthenticated → 401', async () => {
    await request(http()).get(base(CLIENT_A)).expect(401);
    await request(http()).post(base(CLIENT_A)).send({}).expect(401);
  });

  it('an Administrator manages users at client A AND client B — each list holds only its own', async () => {
    const inA = await invite(admin.cookie, CLIENT_A);
    const inB = await invite(admin.cookie, CLIENT_B);
    // One client role: an invitation can only create a Client manager.
    expect(inA.role).toBe('client_manager');

    const listA = await request(http()).get(base(CLIENT_A)).set('Cookie', admin.cookie).expect(200);
    const listB = await request(http()).get(base(CLIENT_B)).set('Cookie', admin.cookie).expect(200);
    const idsA = (listA.body.users as UserBody[]).map((u) => u.id);
    const idsB = (listB.body.users as UserBody[]).map((u) => u.id);
    expect(idsA).toContain(inA.id);
    expect(idsA).not.toContain(inB.id);
    expect(idsB).toContain(inB.id);
    expect(idsB).not.toContain(inA.id);

    // The row really belongs to the PATH's company.
    expect((await owner.authUser.findUnique({ where: { id: inB.id } }))?.clientId).toBe(CLIENT_B);

    const got = await request(http())
      .get(`${base(CLIENT_B)}/${inB.id}`)
      .set('Cookie', admin.cookie)
      .expect(200);
    expect((got.body as UserBody).email).toBe(inB.email);

    const disabled = await request(http())
      .patch(`${base(CLIENT_B)}/${inB.id}`)
      .set('Cookie', admin.cookie)
      .send({ status: 'disabled' })
      .expect(200);
    expect((disabled.body as UserBody).status).toBe('disabled');

    const off = await request(http())
      .delete(`${base(CLIENT_A)}/${inA.id}`)
      .set('Cookie', admin.cookie)
      .expect(200);
    expect((off.body as UserBody).status).toBe('disabled');
    expect(await owner.authUser.count({ where: { id: inA.id } })).toBe(1); // soft
  });

  it('a role is not something to choose or change any more (400)', async () => {
    const inA = await invite(admin.cookie, CLIENT_A);
    await request(http())
      .patch(`${base(CLIENT_A)}/${inA.id}`)
      .set('Cookie', admin.cookie)
      .send({ role: 'client_manager' })
      .expect(400);
  });

  it('the Auditor reads (matrix R) but cannot invite, change or deactivate (403)', async () => {
    const inA = await invite(admin.cookie, CLIENT_A);
    await request(http()).get(base(CLIENT_A)).set('Cookie', auditor.cookie).expect(200);
    await request(http())
      .post(base(CLIENT_A))
      .set('Cookie', auditor.cookie)
      .send(newUser())
      .expect(403);
    await request(http())
      .patch(`${base(CLIENT_A)}/${inA.id}`)
      .set('Cookie', auditor.cookie)
      .send({ status: 'disabled' })
      .expect(403);
    await request(http())
      .delete(`${base(CLIENT_A)}/${inA.id}`)
      .set('Cookie', auditor.cookie)
      .expect(403);
  });

  it('a user id from ANOTHER company → 404 on every verb, and the user is untouched', async () => {
    const inA = await invite(admin.cookie, CLIENT_A);
    await request(http())
      .get(`${base(CLIENT_B)}/${inA.id}`)
      .set('Cookie', admin.cookie)
      .expect(404);
    await request(http())
      .patch(`${base(CLIENT_B)}/${inA.id}`)
      .set('Cookie', admin.cookie)
      .send({ status: 'disabled' })
      .expect(404);
    await request(http())
      .delete(`${base(CLIENT_B)}/${inA.id}`)
      .set('Cookie', admin.cookie)
      .expect(404);
    expect((await owner.authUser.findUnique({ where: { id: inA.id } }))?.status).toBe('active');
  });

  it('unknown or malformed company → 404', async () => {
    await request(http()).get(base(NO_SUCH_CLIENT)).set('Cookie', admin.cookie).expect(404);
    await request(http()).get(base('not-a-uuid')).set('Cookie', admin.cookie).expect(404);
    await request(http())
      .post(base(NO_SUCH_CLIENT))
      .set('Cookie', admin.cookie)
      .send(newUser())
      .expect(404);
  });

  it('HR and GRO officers → 403', async () => {
    for (const p of [hrOfficer, groOfficer]) {
      await request(http()).get(base(CLIENT_A)).set('Cookie', p.cookie).expect(403);
      await request(http())
        .post(base(CLIENT_A))
        .set('Cookie', p.cookie)
        .send(newUser())
        .expect(403);
    }
  });

  // ADR-013 narrowing: Client Admins managed their colleagues until ROLE-03.
  it('a Client manager manages nobody — own company or another (403)', async () => {
    const before = await owner.authUser.count({ where: { clientId: CLIENT_A } });
    await request(http()).get(base(CLIENT_A)).set('Cookie', managerA.cookie).expect(403);
    await request(http()).get(base(CLIENT_B)).set('Cookie', managerA.cookie).expect(403);
    await request(http())
      .post(base(CLIENT_A))
      .set('Cookie', managerA.cookie)
      .send(newUser())
      .expect(403);
    expect(await owner.authUser.count({ where: { clientId: CLIENT_A } })).toBe(before);
  });

  it('an employee → 403', async () => {
    await request(http()).get(base(CLIENT_A)).set('Cookie', employee.cookie).expect(403);
  });

  it('the client-rep path is gone (404 for everyone)', async () => {
    await request(http()).get('/client-users').set('Cookie', admin.cookie).expect(404);
    await request(http()).get('/client-users').set('Cookie', managerA.cookie).expect(404);
  });

  it('deactivating ends the portal user’s open sessions', async () => {
    const user = await invite(admin.cookie, CLIENT_A);
    const login = await request(http())
      .post('/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(200);
    const cookie =
      (
        (login.headers['set-cookie'] as unknown as string[]).find((c) =>
          c.startsWith('hr_session='),
        ) ?? ''
      ).split(';')[0] ?? '';
    await request(http()).get('/auth/me').set('Cookie', cookie).expect(200);

    await request(http())
      .delete(`${base(CLIENT_A)}/${user.id}`)
      .set('Cookie', admin.cookie)
      .expect(200);
    await request(http()).get('/auth/me').set('Cookie', cookie).expect(401);
  });

  it('writes are audited — actor is the Administrator, client is the PATH’s company', async () => {
    const user = await invite(admin.cookie, CLIENT_B);
    await request(http())
      .patch(`${base(CLIENT_B)}/${user.id}`)
      .set('Cookie', admin.cookie)
      .send({ status: 'disabled' })
      .expect(200);
    await request(http())
      .patch(`${base(CLIENT_B)}/${user.id}`)
      .set('Cookie', admin.cookie)
      .send({ status: 'active' })
      .expect(200);
    await request(http())
      .delete(`${base(CLIENT_B)}/${user.id}`)
      .set('Cookie', admin.cookie)
      .expect(200);

    const entries = await owner.auditEntry.findMany({
      where: { resource: 'client-user', actorId: admin.userId, clientId: CLIENT_B },
    });
    const actions = entries.map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['create', 'update', 'deactivate']));
    expect(entries.every((e) => e.actorRole === 'administrator')).toBe(true);
  });
});
