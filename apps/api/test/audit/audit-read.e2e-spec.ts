import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { PrismaClient } from '../../src/generated/prisma/client';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from '../helpers/login';

// AUDIT-04: admin-only audit read API. audit.read is held ONLY by System/
// Company Admin — both MFA-required, so the 200 paths use fully-enrolled
// sessions.

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const CLIENT_B = '22222222-2222-4222-8222-222222222222';
const ACTOR_X = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTOR_Y = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RESOURCE = 'test-audit-read';

interface AuditRow {
  id: string;
  clientId: string | null;
  actorId: string | null;
  resource: string;
  action: string;
}

describe('Audit read API — admin-only (AUDIT-04, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient; // seeds/cleans audit rows (bypasses RLS, full grants)
  let sysAdmin: TestPrincipal;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    await owner.auditEntry.deleteMany({ where: { resource: RESOURCE } });
    await owner.auditEntry.createMany({
      data: [
        { resource: RESOURCE, action: 'create', actorId: ACTOR_X, clientId: CLIENT_A },
        { resource: RESOURCE, action: 'update', actorId: ACTOR_X, clientId: CLIENT_A },
        { resource: RESOURCE, action: 'create', actorId: ACTOR_Y, clientId: CLIENT_B },
        { resource: RESOURCE, action: 'delete', actorId: ACTOR_Y, clientId: CLIENT_B },
      ],
    });
    sysAdmin = await loginAsEnrolledStaff(app, 'system_admin');
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { resource: RESOURCE } });
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  const get = (cookie?: string) => {
    const r = request(app.getHttpServer()).get(`/audit?resource=${RESOURCE}`);
    return cookie ? r.set('Cookie', cookie) : r;
  };

  // ---- Authorization matrix ----

  it('System Admin → 200 with entries', async () => {
    const res = await get(sysAdmin.cookie).expect(200);
    expect((res.body.entries as AuditRow[]).length).toBe(4);
  });

  it('Company Admin → 200', async () => {
    const admin = await loginAsEnrolledStaff(app, 'company_admin');
    await get(admin.cookie).expect(200);
  });

  it('non-admin staff (hr_officer) → 403 (lacks audit.read)', async () => {
    const staff = await loginAsStaff(app, 'hr_officer');
    const res = await get(staff.cookie).expect(403);
    expect(res.body.message).toBe('Permission denied');
  });

  it('client rep → 403', async () => {
    const rep = await loginAsClientRep(app, CLIENT_A, 'client_admin');
    await get(rep.cookie).expect(403);
  });

  it('unauthenticated → 401', async () => {
    await get().expect(401);
  });

  // ---- Serialization + filtering + pagination ----

  it('BigInt id is serialized as a string (no crash)', async () => {
    const res = await get(sysAdmin.cookie).expect(200);
    const rows = res.body.entries as AuditRow[];
    expect(typeof rows[0]?.id).toBe('string');
    expect(rows[0]?.id).toMatch(/^\d+$/);
  });

  it('filters by action and by client', async () => {
    const byAction = await request(app.getHttpServer())
      .get(`/audit?resource=${RESOURCE}&action=create`)
      .set('Cookie', sysAdmin.cookie)
      .expect(200);
    expect((byAction.body.entries as AuditRow[]).every((e) => e.action === 'create')).toBe(true);
    expect((byAction.body.entries as AuditRow[]).length).toBe(2);

    const byClient = await request(app.getHttpServer())
      .get(`/audit?resource=${RESOURCE}&clientId=${CLIENT_B}`)
      .set('Cookie', sysAdmin.cookie)
      .expect(200);
    expect((byClient.body.entries as AuditRow[]).every((e) => e.clientId === CLIENT_B)).toBe(true);
    expect((byClient.body.entries as AuditRow[]).length).toBe(2);
  });

  it('paginates newest-first via limit + beforeId cursor', async () => {
    const page1 = await request(app.getHttpServer())
      .get(`/audit?resource=${RESOURCE}&limit=2`)
      .set('Cookie', sysAdmin.cookie)
      .expect(200);
    const rows1 = page1.body.entries as AuditRow[];
    expect(rows1).toHaveLength(2);
    expect(page1.body.nextCursor).toBeTruthy();
    // Descending by id.
    expect(BigInt(rows1[0]!.id) > BigInt(rows1[1]!.id)).toBe(true);

    const page2 = await request(app.getHttpServer())
      .get(`/audit?resource=${RESOURCE}&limit=2&beforeId=${page1.body.nextCursor}`)
      .set('Cookie', sysAdmin.cookie)
      .expect(200);
    const rows2 = page2.body.entries as AuditRow[];
    expect(rows2).toHaveLength(2);
    // No overlap between pages.
    expect(BigInt(rows2[0]!.id) < BigInt(rows1[1]!.id)).toBe(true);
    expect(page2.body.nextCursor).toBeNull();
  });
});
