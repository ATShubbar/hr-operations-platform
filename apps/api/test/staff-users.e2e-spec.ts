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
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// UX-10b: staff user management + the name directory.
//
// The matrix row "System config & staff users" is System Admin CRUD / Company
// Admin R / everyone else nothing. The directory is a SEPARATE, narrower
// capability held by every staff role — these tests exist mostly to pin that
// split down, because the easy mistake is to let the narrow endpoint grow into
// the broad one.

const MARK = 'su-test-';
const CLIENT_A = '11111111-1111-4111-8111-111111111111';

interface StaffUserBody {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  status: 'active' | 'disabled';
  mfaEnrolled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DirectoryEntry {
  id: string;
  displayName: string | null;
  role: string;
}

describe('Staff user management + directory (UX-10b, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let sysAdmin: TestPrincipal; // CRUD
  let coAdmin: TestPrincipal; // read only
  let hr: TestPrincipal; // directory only
  let rep: TestPrincipal; // client rep — nothing

  const http = () => app.getHttpServer();

  const create = (cookie: string, over: Record<string, unknown> = {}) =>
    request(http())
      .post('/staff-users')
      .set('Cookie', cookie)
      .send({
        email: `${MARK}${randomUUID()}@example.com`,
        password: 'staff-pw-12345',
        role: 'hr_officer',
        displayName: 'Test Person',
        ...over,
      });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    sysAdmin = await loginAsEnrolledStaff(app, 'system_admin');
    coAdmin = await loginAsEnrolledStaff(app, 'company_admin');
    hr = await loginAsStaff(app, 'hr_officer');
    rep = await loginAsClientRep(app, CLIENT_A, 'client_admin');
    await owner.auditEntry.deleteMany({ where: { resource: 'staff-user' } });
    await owner.authUser.deleteMany({ where: { email: { startsWith: MARK } } });
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { resource: 'staff-user' } });
    await owner.authUser.deleteMany({ where: { email: { startsWith: MARK } } });
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('unauthenticated → 401', async () => {
    await request(http()).get('/staff-users').expect(401);
    await request(http()).get('/staff-users/directory').expect(401);
    await request(http()).post('/staff-users').send({}).expect(401);
  });

  it('System Admin creates a staff user → 201, and no secret material leaks', async () => {
    const res = await create(sysAdmin.cookie).expect(201);
    const body = res.body as StaffUserBody;
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.role).toBe('hr_officer');
    expect(body.status).toBe('active');
    expect(body.displayName).toBe('Test Person');
    expect(body.mfaEnrolled).toBe(false);
    // The response carries whether MFA is enrolled — never the secret, never the
    // password or its hash.
    expect(JSON.stringify(body)).not.toMatch(/password|hash|secret/i);
  });

  it('Company Admin READS but cannot write (matrix: CRUD vs R)', async () => {
    await request(http()).get('/staff-users').set('Cookie', coAdmin.cookie).expect(200);
    await create(coAdmin.cookie).expect(403);
    const target = (await create(sysAdmin.cookie).expect(201)).body as StaffUserBody;
    await request(http())
      .patch(`/staff-users/${target.id}`)
      .set('Cookie', coAdmin.cookie)
      .send({ status: 'disabled' })
      .expect(403);
    await request(http())
      .delete(`/staff-users/${target.id}`)
      .set('Cookie', coAdmin.cookie)
      .expect(403);
  });

  it('a staff role outside the matrix row gets NOTHING from the management API', async () => {
    await request(http()).get('/staff-users').set('Cookie', hr.cookie).expect(403);
    await create(hr.cookie).expect(403);
  });

  it('client reps are refused everywhere, including the directory', async () => {
    await request(http()).get('/staff-users').set('Cookie', rep.cookie).expect(403);
    await request(http()).get('/staff-users/directory').set('Cookie', rep.cookie).expect(403);
    await create(rep.cookie).expect(403);
  });

  describe('the directory is narrower than the management view', () => {
    it('every staff role can read it', async () => {
      await request(http()).get('/staff-users/directory').set('Cookie', hr.cookie).expect(200);
      await request(http()).get('/staff-users/directory').set('Cookie', coAdmin.cookie).expect(200);
    });

    it('it returns id + displayName + role and NOTHING else', async () => {
      await create(sysAdmin.cookie).expect(201);
      const res = await request(http())
        .get('/staff-users/directory')
        .set('Cookie', hr.cookie)
        .expect(200);
      const users = res.body.users as DirectoryEntry[];
      expect(users.length).toBeGreaterThan(0);
      // The whole point of the separate permission: no email, no status, no MFA
      // state, no timestamps. Asserted on the KEYS, so a future field added to
      // the management shape cannot silently ride along.
      for (const entry of users) {
        expect(Object.keys(entry).sort()).toEqual(['displayName', 'id', 'role']);
      }
      expect(JSON.stringify(users)).not.toMatch(/@|password|hash|secret|mfa|status/i);
    });
  });

  describe('self-protection', () => {
    it('an admin cannot disable their own account', async () => {
      const me = await request(http()).get('/auth/me').set('Cookie', sysAdmin.cookie).expect(200);
      const myId = (me.body as { userId: string }).userId;
      await request(http()).delete(`/staff-users/${myId}`).set('Cookie', sysAdmin.cookie).expect(400);
      await request(http())
        .patch(`/staff-users/${myId}`)
        .set('Cookie', sysAdmin.cookie)
        .send({ status: 'disabled' })
        .expect(400);
    });

    it('an admin cannot change their own role', async () => {
      const me = await request(http()).get('/auth/me').set('Cookie', sysAdmin.cookie).expect(200);
      const myId = (me.body as { userId: string }).userId;
      await request(http())
        .patch(`/staff-users/${myId}`)
        .set('Cookie', sysAdmin.cookie)
        .send({ role: 'read_only' })
        .expect(400);
    });

    it('but may rename themselves', async () => {
      const me = await request(http()).get('/auth/me').set('Cookie', sysAdmin.cookie).expect(200);
      const myId = (me.body as { userId: string }).userId;
      const before = (me.body as { displayName: string | null }).displayName;
      await request(http())
        .patch(`/staff-users/${myId}`)
        .set('Cookie', sysAdmin.cookie)
        .send({ displayName: 'Renamed Admin' })
        .expect(200);
      // Restore, so the shared seed keeps its shape for later specs.
      await request(http())
        .patch(`/staff-users/${myId}`)
        .set('Cookie', sysAdmin.cookie)
        .send({ displayName: before ?? 'Layla Al-Rashid' })
        .expect(200);
    });
  });

  it('deactivate is a status change, not a delete', async () => {
    const target = (await create(sysAdmin.cookie).expect(201)).body as StaffUserBody;
    const res = await request(http())
      .delete(`/staff-users/${target.id}`)
      .set('Cookie', sysAdmin.cookie)
      .expect(200);
    expect((res.body as StaffUserBody).status).toBe('disabled');
    // Still there: audit entries and sessions reference this id.
    const row = await owner.authUser.findUnique({ where: { id: target.id } });
    expect(row).not.toBeNull();
  });

  it('duplicate email → 400; unknown id → 404; bad payload → 400', async () => {
    const email = `${MARK}${randomUUID()}@example.com`;
    await create(sysAdmin.cookie, { email }).expect(201);
    await create(sysAdmin.cookie, { email }).expect(400);
    await request(http())
      .get(`/staff-users/${randomUUID()}`)
      .set('Cookie', sysAdmin.cookie)
      .expect(404);
    await request(http())
      .post('/staff-users')
      .set('Cookie', sysAdmin.cookie)
      .send({ email: 'not-an-email', password: 'x', role: 'nope' })
      .expect(400);
  });

  it('/auth/me carries the display name', async () => {
    const res = await request(http()).get('/auth/me').set('Cookie', hr.cookie).expect(200);
    expect(res.body).toHaveProperty('displayName');
  });

  it('mutations are audited', async () => {
    await create(sysAdmin.cookie).expect(201);
    const entries = await owner.auditEntry.findMany({ where: { resource: 'staff-user' } });
    const actions = new Set(entries.map((e) => e.action));
    expect(actions.has('create')).toBe(true);
    // No secret material in the audit payload either. (The row id is a BigInt,
    // which JSON.stringify refuses — so assert on the payloads, which is what
    // the claim is actually about.)
    const payloads = JSON.stringify(entries.map((e) => ({ before: e.before, after: e.after })));
    expect(payloads).not.toMatch(/password|hash|secret/i);
  });
});
