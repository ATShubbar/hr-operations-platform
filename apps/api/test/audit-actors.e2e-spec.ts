import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { PolicyService } from '../src/modules/auth/public-api';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// AUDIT-09: the Audit trail names every actor. The page named staff from the
// staff directory and showed anyone else — a client manager, an employee — as an
// id fragment. GET /audit/actors?ids= answers WHO a set of actor ids are: the id
// and the display name, nothing else, and only for accounts that appear in the
// trail.

const MARK = 'AUDIT-09';
const db = () =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });

describe('Audit actors (AUDIT-09, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let admin: TestPrincipal;
  let auditor: TestPrincipal;
  let hr: TestPrincipal;
  let manager: TestPrincipal;
  let clientId: string;
  // An account that acted and has no name; one that exists and never acted; an
  // id that acted and whose account is gone.
  const unnamed = randomUUID();
  const silent = randomUUID();
  const gone = randomUUID();

  const actors = (who: TestPrincipal, ids: string | undefined) =>
    request(app.getHttpServer())
      .get('/audit/actors')
      .query(ids === undefined ? {} : { ids })
      .set('Cookie', who.cookie);

  const account = (id: string, displayName: string | null) =>
    owner.authUser.create({
      data: {
        id,
        email: `audit09-${id}@e2e.test`,
        displayName,
        passwordHash: 'x',
        principalType: 'staff',
        role: 'hr_officer',
      },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = db();
    clientId = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} co` } })).id;
    admin = await loginAsEnrolledStaff(app, 'administrator');
    auditor = await loginAsEnrolledStaff(app, 'auditor');
    hr = await loginAsStaff(app, 'hr_officer');
    manager = await loginAsClientRep(app, clientId, 'client_manager');
    await owner.authUser.update({
      where: { id: manager.userId },
      data: { displayName: `${MARK} Client Manager` },
    });
    await account(unnamed, null);
    await account(silent, `${MARK} Silent`);
    await owner.auditEntry.createMany({
      data: [
        {
          actorId: manager.userId,
          actorRole: 'client_manager',
          clientId,
          resource: 'request',
          action: 'create',
        },
        {
          actorId: manager.userId,
          actorRole: 'client_manager',
          clientId,
          resource: 'request',
          action: 'update',
        },
        { actorId: unnamed, actorRole: 'hr_officer', resource: 'task', action: 'create' },
        { actorId: gone, actorRole: 'hr_officer', resource: 'task', action: 'create' },
      ],
    });
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({
      where: { actorId: { in: [manager.userId, unnamed, gone] } },
    });
    await owner.authUser.deleteMany({ where: { id: { in: [unnamed, silent] } } });
    await cleanupHelperUsers(app);
    await owner.client.deleteMany({ where: { id: clientId } });
    await owner.$disconnect();
    await app.close();
  });

  it('names a client manager who acted — the id and the name, and nothing else', async () => {
    const res = await actors(admin, manager.userId).expect(200);
    expect(res.body).toEqual({
      actors: [{ id: manager.userId, name: `${MARK} Client Manager` }],
    });
    expect(Object.keys(res.body.actors[0]).sort()).toEqual(['id', 'name']);
    expect(res.text).not.toContain('@'); // never an email
  });

  it('an account that acted and has no name comes back with a null name', async () => {
    const res = await actors(admin, unnamed).expect(200);
    expect(res.body.actors).toEqual([{ id: unnamed, name: null }]);
  });

  it('says nothing about an account that never acted — a name cannot be fished by id', async () => {
    const res = await actors(admin, silent).expect(200);
    expect(res.body.actors).toEqual([]);
  });

  it('says nothing about an actor whose account no longer exists', async () => {
    const res = await actors(admin, gone).expect(200);
    expect(res.body.actors).toEqual([]);
  });

  it('answers for several ids at once, each at most once', async () => {
    const ids = [manager.userId, unnamed, silent, gone, manager.userId].join(',');
    const res = await actors(admin, ids).expect(200);
    expect(res.body.actors.map((a: { id: string }) => a.id).sort()).toEqual(
      [manager.userId, unnamed].sort(),
    );
  });

  it('refuses a request without ids, with a value that is not an id, or with more than 100', async () => {
    await actors(admin, undefined).expect(400);
    await actors(admin, '').expect(400);
    await actors(admin, 'not-an-id').expect(400);
    await actors(admin, `${manager.userId},nope`).expect(400);
    await actors(admin, Array.from({ length: 101 }, () => randomUUID()).join(',')).expect(400);
    await actors(admin, Array.from({ length: 100 }, () => randomUUID()).join(',')).expect(200);
  });

  it('is for the people who read the audit trail: the Auditor yes, an HR officer no, a client manager no', async () => {
    await actors(auditor, manager.userId).expect(200);
    await actors(hr, manager.userId).expect(403);
    await actors(manager, manager.userId).expect(403);
    await request(app.getHttpServer()).get('/audit/actors').query({ ids: unnamed }).expect(401);
  });
});

// No client role holds audit.read, so the permission alone keeps a client
// manager out. Granting it here proves the staff check is a second lock.
describe('Audit actors — staff only, even for a widened client role (AUDIT-09)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let manager: TestPrincipal;
  let clientId: string;

  class WidenedPolicy extends PolicyService {
    override can(role: string | null | undefined, permission: string): boolean {
      if (role === 'client_manager' && permission === 'audit.read') return true;
      return super.can(role, permission);
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PolicyService)
      .useClass(WidenedPolicy)
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = db();
    clientId = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} widened` } }))
      .id;
    manager = await loginAsClientRep(app, clientId, 'client_manager');
    await owner.auditEntry.create({
      data: {
        actorId: manager.userId,
        actorRole: 'client_manager',
        clientId,
        resource: 'request',
        action: 'create',
      },
    });
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { actorId: manager.userId } });
    await cleanupHelperUsers(app);
    await owner.client.deleteMany({ where: { id: clientId } });
    await owner.$disconnect();
    await app.close();
  });

  it('a client manager granted audit.read is still refused', async () => {
    await request(app.getHttpServer())
      .get('/audit/actors')
      .query({ ids: manager.userId })
      .set('Cookie', manager.cookie)
      .expect(403);
  });
});
