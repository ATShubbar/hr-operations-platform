import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { cleanupHelperUsers, loginAsEnrolledStaff, type TestPrincipal } from './helpers/login';

// AUDIT-08: "everything EXCEPT these record types". The Audit trail's Records
// category means "whatever no other category claims". The screen used to send
// a fixed list of record types for it, written when the screen was built, so
// every type added since (dependants, sequences, leave, fees, commercial terms,
// invoices) silently vanished under that filter. `notResources` lets the
// screen send the OTHER categories' types as an exclusion, so a new type falls
// under Records with no further change.
describe('Audit trail: excluding record types (AUDIT-08, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let auditor: TestPrincipal;
  // A made-up actor, so this spec's rows can be picked out exactly.
  const actor = randomUUID();

  const http = () => request(app.getHttpServer());
  const list = (params: string) =>
    http().get(`/audit?actorId=${actor}&${params}`).set('Cookie', auditor.cookie);
  const resourcesOf = async (params: string): Promise<string[]> =>
    ((await list(params).expect(200)).body.entries as Array<{ resource: string }>)
      .map((e) => e.resource)
      .sort();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    auditor = await loginAsEnrolledStaff(app, 'auditor');
    await owner.auditEntry.createMany({
      data: [
        // Claimed by other categories:
        { actorId: actor, actorRole: 'hr_officer', resource: 'request', action: 'process' },
        { actorId: actor, actorRole: 'hr_officer', resource: 'task', action: 'update' },
        { actorId: actor, actorRole: 'administrator', resource: 'staff-user', action: 'update' },
        // Records — including types the old fixed list never knew:
        { actorId: actor, actorRole: 'hr_officer', resource: 'employee', action: 'update' },
        { actorId: actor, actorRole: 'hr_officer', resource: 'fee', action: 'create' },
        { actorId: actor, actorRole: 'administrator', resource: 'invoice', action: 'paid' },
        { actorId: actor, actorRole: 'hr_officer', resource: 'dependant', action: 'add' },
        // A type nobody has invented yet: still a record.
        { actorId: actor, actorRole: 'hr_officer', resource: 'something-new', action: 'create' },
      ],
    });
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { actorId: actor } });
    // The export below audits itself, under the auditor's own id.
    await owner.auditEntry.deleteMany({ where: { actorId: auditor.userId } });
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('leaves out the named record types and keeps every other one — known or new', async () => {
    expect(await resourcesOf('notResources=request,task,staff-user')).toEqual([
      'dependant',
      'employee',
      'fee',
      'invoice',
      'something-new',
    ]);
    // Without it, all eight.
    expect(await resourcesOf('limit=50')).toHaveLength(8);
  });

  it('composes with the other filters instead of replacing them', async () => {
    // With a text search: only what matches AND is not excluded.
    expect(await resourcesOf('notResources=request,task,staff-user&q=fee')).toEqual(['fee']);
    // With an inclusion list: the intersection.
    expect(await resourcesOf('resources=fee,request&notResources=request')).toEqual(['fee']);
    // With severity: an invoice marked paid is notable; excluding invoices removes it.
    const notable = await resourcesOf('severity=notable');
    expect(notable).toContain('invoice');
    expect(await resourcesOf('severity=notable&notResources=invoice')).toEqual(
      notable.filter((r) => r !== 'invoice'),
    );
  });

  it('the export follows the same exclusion, so the file is what the screen shows', async () => {
    const res = await http()
      .get(`/audit/export?actorId=${actor}&notResources=request,task,staff-user`)
      .set('Cookie', auditor.cookie)
      .expect(200);
    const csv = res.text;
    for (const kept of ['fee', 'invoice', 'dependant', 'something-new', 'employee']) {
      expect(csv, kept).toContain(`,${kept},`);
    }
    for (const dropped of ['request', 'task', 'staff-user']) {
      expect(csv, dropped).not.toContain(`,${dropped},`);
    }
  });

  it('refuses an exclusion that is not a list of record types (400)', async () => {
    await list('notResources=').expect(400);
    await list(`notResources=${'x'.repeat(101)}`).expect(400);
    await list(`notResources=${Array.from({ length: 51 }, (_, i) => `t${i}`).join(',')}`).expect(
      400,
    );
  });
});
