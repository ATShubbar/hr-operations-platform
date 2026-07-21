import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/public-api';
import { requestContext, type RequestContext } from '../src/context/request-context';

// AUDIT-01: append-only audit table + synchronous transactional write.
// `staff` is the app_staff role (SELECT+INSERT, no UPDATE/DELETE on
// aud_entries). `owner` is the migration/DATABASE_URL role, used ONLY for
// test cleanup — app_staff cannot delete audit rows by design.

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const ACTOR = '99999999-9999-4999-8999-999999999999';
const AUDIT_RESOURCE = 'test-scope-check';

function staffCtx(requestId: string): RequestContext {
  return {
    requestId,
    actorId: ACTOR,
    clientId: CLIENT_A,
    principalType: 'staff',
    role: 'company_admin',
  };
}

describe('Audit log — append-only + transactional write (AUDIT-01, e2e)', () => {
  let app: INestApplication;
  let staff: PrismaService;
  let audit: AuditService;
  let owner: PrismaClient;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    staff = app.get(PrismaService);
    audit = app.get(AuditService);
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    await owner.auditEntry.deleteMany({ where: { resource: AUDIT_RESOURCE } });
    await owner.coreScopeCheck.deleteMany({ where: { note: { startsWith: 'audit-e2e:' } } });
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { resource: AUDIT_RESOURCE } });
    await owner.coreScopeCheck.deleteMany({ where: { note: { startsWith: 'audit-e2e:' } } });
    await owner.$disconnect();
    await app.close();
  });

  it('commits the audit row in the same transaction as the mutation (+ context defaulting)', async () => {
    const before = await staff.auditEntry.count();

    await requestContext.run(staffCtx('req-audit-commit'), async () => {
      await staff.$transaction(async (tx) => {
        const row = await tx.coreScopeCheck.create({
          data: { clientId: CLIENT_A, note: 'audit-e2e:commit' },
        });
        await audit.record(tx, {
          resource: AUDIT_RESOURCE,
          action: 'create',
          after: { id: row.id, note: row.note },
        });
      });
    });

    const entries = await staff.auditEntry.findMany({ where: { requestId: 'req-audit-commit' } });
    expect(entries).toHaveLength(1);
    // Actor/scope/requestId defaulted from the request context; not passed in.
    expect(entries[0]).toMatchObject({
      resource: AUDIT_RESOURCE,
      action: 'create',
      actorId: ACTOR,
      actorRole: 'company_admin',
      clientId: CLIENT_A,
    });
    expect(entries[0]?.after).toMatchObject({ note: 'audit-e2e:commit' });
    expect(await staff.auditEntry.count()).toBe(before + 1);
  });

  it('rolls the audit row back when the caller transaction fails (no orphan audit)', async () => {
    const auditBefore = await staff.auditEntry.count();
    const scopeBefore = await staff.coreScopeCheck.count({
      where: { note: 'audit-e2e:rollback' },
    });

    await expect(
      staff.$transaction(async (tx) => {
        await tx.coreScopeCheck.create({
          data: { clientId: CLIENT_A, note: 'audit-e2e:rollback' },
        });
        await audit.record(tx, {
          resource: AUDIT_RESOURCE,
          action: 'create',
          actorId: ACTOR,
          after: { note: 'audit-e2e:rollback' },
        });
        throw new Error('boom after audit write');
      }),
    ).rejects.toThrow('boom after audit write');

    // Both the mutation AND its audit entry are gone — atomic.
    expect(await staff.auditEntry.count()).toBe(auditBefore);
    expect(
      await staff.coreScopeCheck.count({ where: { note: 'audit-e2e:rollback' } }),
    ).toBe(scopeBefore);
  });

  it('is append-only: app_staff cannot UPDATE or DELETE an audit row', async () => {
    await staff.$transaction(async (tx) => {
      await audit.record(tx, {
        resource: AUDIT_RESOURCE,
        action: 'append-only-probe',
        actorId: ACTOR,
      });
    });
    const row = await staff.auditEntry.findFirst({
      where: { action: 'append-only-probe' },
      orderBy: { id: 'desc' },
    });
    if (!row) throw new Error('probe audit row was not written');
    const id = row.id;

    await expect(
      staff.$executeRawUnsafe(`UPDATE aud_entries SET action = 'tampered' WHERE id = ${id}`),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      staff.$executeRawUnsafe(`DELETE FROM aud_entries WHERE id = ${id}`),
    ).rejects.toThrow(/permission denied/i);

    // The row is untouched — the trail is immutable to the app role.
    const still = await staff.auditEntry.findUnique({ where: { id } });
    expect(still?.action).toBe('append-only-probe');
  });
});
