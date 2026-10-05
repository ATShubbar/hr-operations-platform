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

// DS-15: what the Audit trail screen needs from the API.
// - `resources`: several record types at once (a category is a set of them);
// - `q`: case-insensitive text search over the action and the record type, ON
//   THE SERVER — filtering only the rows a page has loaded would silently miss
//   older entries (the UX-03c rule);
// - `GET /audit/summary`: events since a given moment + distinct actors.
// Both stay audit.read (Administrator, Auditor).

const R1 = 'test-trail-alpha';
const R2 = 'test-trail-beta';
const R3 = 'test-trail-gamma';
const ACTOR_X = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';
const ACTOR_Y = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc';

interface Row {
  id: string;
  resource: string;
  action: string;
}

describe('Audit trail API — resources, q, summary (DS-15, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let admin: TestPrincipal;
  let seededAt: Date;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    await owner.auditEntry.deleteMany({ where: { resource: { in: [R1, R2, R3] } } });
    seededAt = new Date(Date.now() - 1000);
    await owner.auditEntry.createMany({
      data: [
        { resource: R1, action: 'create', actorId: ACTOR_X },
        { resource: R1, action: 'Archive', actorId: ACTOR_X },
        { resource: R2, action: 'update', actorId: ACTOR_Y },
        { resource: R3, action: 'delete', actorId: ACTOR_Y },
      ],
    });
    admin = await loginAsEnrolledStaff(app, 'administrator');
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { resource: { in: [R1, R2, R3] } } });
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  const get = (path: string, cookie = admin.cookie) =>
    request(app.getHttpServer()).get(path).set('Cookie', cookie);

  it('resources= returns entries of every listed record type and no other', async () => {
    const res = await get(`/audit?resources=${R1},${R2}`).expect(200);
    const rows = res.body.entries as Row[];
    expect(rows.map((r) => r.resource).sort()).toEqual([R1, R1, R2]);
    // the load-bearing assertion: the unlisted type is ABSENT
    expect(rows.some((r) => r.resource === R3)).toBe(false);
  });

  it('q= searches action and record type, case-insensitively, on the server', async () => {
    const byAction = await get(`/audit?resources=${R1},${R2},${R3}&q=ARCH`).expect(200);
    expect((byAction.body.entries as Row[]).map((r) => r.action)).toEqual(['Archive']);

    const byResource = await get(`/audit?q=trail-gam`).expect(200);
    const rows = byResource.body.entries as Row[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.resource === R3)).toBe(true);
  });

  it('q= composes with the other filters and the cursor', async () => {
    const page1 = await get(`/audit?resources=${R1},${R2},${R3}&q=e&limit=2`).expect(200);
    expect(page1.body.entries).toHaveLength(2);
    expect(page1.body.nextCursor).toBeTruthy();
    const page2 = await get(
      `/audit?resources=${R1},${R2},${R3}&q=e&limit=2&beforeId=${page1.body.nextCursor}`,
    ).expect(200);
    const rows = [...page1.body.entries, ...page2.body.entries] as Row[];
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length); // no overlap
    // Only the listed types, every one matching — without the filters a page of 2
    // from the whole log would pass the count checks above by accident.
    expect(rows.every((r) => [R1, R2, R3].includes(r.resource))).toBe(true);
    expect(rows.every((r) => /e/i.test(r.action) || /e/i.test(r.resource))).toBe(true);
    // 'create', 'Archive', 'update', 'delete' all contain an e
    expect(ids).toHaveLength(4);
    expect(page2.body.nextCursor).toBeNull();
  });

  it('each entry carries its record id (null when none was recorded)', async () => {
    const res = await get(`/audit?resources=${R1}`).expect(200);
    const rows = res.body.entries as Array<Row & { resourceId?: unknown }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => 'resourceId' in r && r.resourceId === null)).toBe(true);
  });

  it('rejects a malformed query (400)', async () => {
    await get('/audit?resources=').expect(400);
    await get(`/audit?q=${'x'.repeat(101)}`).expect(400);
  });

  it('summary: events since a moment, and distinct actors; exactly those keys', async () => {
    const res = await get(`/audit/summary?from=${seededAt.toISOString()}`).expect(200);
    // AUDIT-07 added `critical` (the Flagged critical tile) — its count is
    // proven in audit-export.e2e-spec.ts.
    expect(Object.keys(res.body).sort()).toEqual(['actors', 'critical', 'eventsToday']);
    expect(res.body.eventsToday).toBeGreaterThanOrEqual(4);
    expect(res.body.actors).toBeGreaterThanOrEqual(2);

    // a moment in the future → nothing since
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const none = await get(`/audit/summary?from=${future}`).expect(200);
    expect(none.body.eventsToday).toBe(0);
  });

  it('summary is audit.read only: Auditor 200, HR officer and client rep 403, anonymous 401', async () => {
    const auditor = await loginAsEnrolledStaff(app, 'auditor');
    await get('/audit/summary', auditor.cookie).expect(200);
    const hr = await loginAsStaff(app, 'hr_officer');
    await get('/audit/summary', hr.cookie).expect(403);
    const rep = await loginAsClientRep(
      app,
      '11111111-1111-4111-8111-111111111111',
      'client_manager',
    );
    await get('/audit/summary', rep.cookie).expect(403);
    await request(app.getHttpServer()).get('/audit/summary').expect(401);
  });
});
