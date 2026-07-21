import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { PrismaClient } from '../../src/generated/prisma/client';
import { ScopedPrismaService } from '../../src/prisma/scoped-prisma.service';
import { AuditService } from '../../src/modules/audit/public-api';
import { cleanupHelperUsers, loginAsClientRep, type TestPrincipal } from '../helpers/login';

// AUDIT-03: automatic mutation logging proven on a real write path. A
// client-rep POST /scope-check writes the row AND its audit entry in ONE
// client-scoped transaction; the scoped-transaction primitive is atomic and
// RLS-bounded.

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const CLIENT_B = '22222222-2222-4222-8222-222222222222';

describe('Audit mutation logging — write path (AUDIT-03, e2e)', () => {
  let app: INestApplication;
  let scoped: ScopedPrismaService;
  let audit: AuditService;
  let owner: PrismaClient; // reads/cleans audit rows (app_staff cannot delete)
  let repA: TestPrincipal;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    scoped = app.get(ScopedPrismaService);
    audit = app.get(AuditService);
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    repA = await loginAsClientRep(app, CLIENT_A, 'client_admin');
    await owner.auditEntry.deleteMany({ where: { resource: 'scope-check' } });
    await owner.coreScopeCheck.deleteMany({ where: { note: { startsWith: 'audit03' } } });
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { resource: 'scope-check' } });
    await owner.coreScopeCheck.deleteMany({ where: { note: { startsWith: 'audit03' } } });
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('POST /scope-check writes the row AND exactly one audit entry, scoped to the caller', async () => {
    const note = 'audit03-endpoint';
    const res = await request(app.getHttpServer())
      .post('/scope-check')
      .set('Cookie', repA.cookie)
      .send({ note })
      .expect(201);
    expect((res.body as { clientId: string }).clientId).toBe(CLIENT_A);

    const reqId = res.headers['x-request-id'] as string;
    const entries = await owner.auditEntry.findMany({ where: { requestId: reqId } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      resource: 'scope-check',
      action: 'create',
      clientId: CLIENT_A,
      actorId: repA.userId,
      actorRole: 'client_admin',
    });
    expect(entries[0]?.after).toMatchObject({ note });

    // The mutation itself committed too.
    const rows = await owner.coreScopeCheck.findMany({ where: { note } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.clientId).toBe(CLIENT_A);
  });

  it('scoped transaction is atomic: a failure rolls BOTH the row and its audit back', async () => {
    await expect(
      scoped.transaction(CLIENT_A, async (tx) => {
        await tx.coreScopeCheck.create({ data: { clientId: CLIENT_A, note: 'audit03-rollback' } });
        await audit.record(tx, {
          resource: 'scope-check',
          action: 'rollback-probe',
          clientId: CLIENT_A,
          after: { note: 'audit03-rollback' },
        });
        throw new Error('boom after audit write');
      }),
    ).rejects.toThrow('boom after audit write');

    expect(await owner.coreScopeCheck.count({ where: { note: 'audit03-rollback' } })).toBe(0);
    expect(await owner.auditEntry.count({ where: { action: 'rollback-probe' } })).toBe(0);
  });

  it('RLS backstop: a scoped transaction cannot write another client’s row', async () => {
    await expect(
      scoped.transaction(CLIENT_A, async (tx) => {
        await tx.coreScopeCheck.create({ data: { clientId: CLIENT_B, note: 'audit03-backstop' } });
      }),
    ).rejects.toThrow(/row-level security/i);
    expect(await owner.coreScopeCheck.count({ where: { note: 'audit03-backstop' } })).toBe(0);
  });
});
