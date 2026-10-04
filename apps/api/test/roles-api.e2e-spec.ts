import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../src/modules/auth/public-api';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEmployee,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// DS-19: GET /roles — the built-in roles as the code defines them, for the Roles
// and permissions screen. READ-ONLY: the response is ROLE_PERMISSIONS (the bundles
// role-matrix.e2e-spec pins to architecture.md) plus how many active accounts hold
// each role. Gated by staff-user.read — Administrator + Auditor only.

const SEED_CLIENT_A = '11111111-1111-4111-8111-111111111111';

describe('Roles API (DS-19, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let admin: TestPrincipal;
  let auditor: TestPrincipal;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    http = app.getHttpServer();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    admin = await loginAsEnrolledStaff(app, 'administrator');
    auditor = await loginAsEnrolledStaff(app, 'auditor');
  });

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('returns exactly the built-in roles and their permissions, as the code defines them', async () => {
    const res = await request(http).get('/roles').set('Cookie', admin.cookie).expect(200);
    expect(Object.keys(res.body).sort()).toEqual(['permissions', 'roles']);
    expect(res.body.permissions).toEqual([...PERMISSIONS]);
    const ids = res.body.roles.map((r: { id: string }) => r.id);
    expect(ids).toEqual(Object.keys(ROLE_PERMISSIONS));
    for (const r of res.body.roles as {
      id: keyof typeof ROLE_PERMISSIONS;
      permissions: string[];
    }[]) {
      expect(Object.keys(r).sort()).toEqual(['accounts', 'id', 'kind', 'permissions']);
      expect(r.permissions).toEqual([...ROLE_PERMISSIONS[r.id]]);
    }
    const kind = Object.fromEntries(
      res.body.roles.map((r: { id: string; kind: string }) => [r.id, r.kind]),
    );
    expect(kind).toEqual({
      administrator: 'staff',
      hr_officer: 'staff',
      gro_officer: 'staff',
      auditor: 'staff',
      client_manager: 'client',
      employee: 'employee',
    });
  });

  it('counts the ACTIVE accounts holding each role', async () => {
    // Other specs create and delete helper accounts concurrently, so the count is
    // only asserted for roles whose database count did not move around the call.
    const count = async () => {
      const rows = await owner.authUser.groupBy({
        by: ['role'],
        where: { status: 'active' },
        _count: { _all: true },
      });
      return Object.fromEntries(rows.map((r) => [r.role, r._count._all])) as Record<string, number>;
    };
    const before = await count();
    const res = await request(http).get('/roles').set('Cookie', auditor.cookie).expect(200);
    const after = await count();
    let checked = 0;
    for (const r of res.body.roles as { id: string; accounts: number }[]) {
      if ((before[r.id] ?? 0) !== (after[r.id] ?? 0)) continue;
      expect(r.accounts).toBe(before[r.id] ?? 0);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(3);
  });

  it('a disabled account is not counted', async () => {
    const extra = await loginAsStaff(app, 'gro_officer');
    await owner.authUser.update({ where: { id: extra.userId }, data: { status: 'disabled' } });
    const db = (status?: 'active') =>
      owner.authUser.count({ where: { role: 'gro_officer', ...(status ? { status } : {}) } });
    // Bracketed against concurrent specs (retry until the count holds still).
    for (let i = 0; i < 5; i++) {
      const before = await db('active');
      const res = await request(http).get('/roles').set('Cookie', admin.cookie).expect(200);
      const after = await db('active');
      if (before !== after) continue;
      const api = (res.body.roles as { id: string; accounts: number }[]).find(
        (r) => r.id === 'gro_officer',
      )!.accounts;
      expect(api).toBe(before);
      // …and there IS a disabled GRO officer it left out.
      expect(await db()).toBeGreaterThan(before);
      return;
    }
    throw new Error('gro_officer count never held still');
  });

  it('only Administrator and Auditor may read it', async () => {
    const hr = await loginAsStaff(app, 'hr_officer');
    const gro = await loginAsStaff(app, 'gro_officer');
    const rep = await loginAsClientRep(app, SEED_CLIENT_A);
    const emp = await loginAsEmployee(app);
    for (const p of [hr, gro, rep, emp]) {
      await request(http).get('/roles').set('Cookie', p.cookie).expect(403);
    }
    await request(http).get('/roles').expect(401);
  });
});
