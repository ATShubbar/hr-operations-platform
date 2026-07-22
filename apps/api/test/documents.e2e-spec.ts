import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { DocumentsService } from '../src/modules/documents/public-api';

// DOC-01: the document registry. Staff manage all documents via DocumentsService
// (app_staff path); metadata only — the blob lives in object storage under a
// per-client key the service derives. A client-rep may READ ONLY its own
// client's documents (standard client_id RLS) and never write.

const C1 = 'dc111111-0000-4000-8000-000000000001';
const C2 = 'dc222222-0000-4000-8000-000000000002';
const MARK = 'DOC-01-test';

describe('Document registry — service + expiry + RLS (DOC-01, e2e)', () => {
  let app: INestApplication;
  let documents: DocumentsService;
  let owner: PrismaClient; // setup/cleanup — bypasses RLS
  let clientDb: PrismaClient; // app_client — RLS-enforced

  async function readScoped(scope: string): Promise<Array<{ client_id: string }>> {
    const [, rows] = await clientDb.$transaction([
      clientDb.$executeRaw`SELECT set_config('app.client_id', ${scope}, TRUE)`,
      clientDb.$queryRaw`SELECT client_id FROM doc_documents WHERE title LIKE ${`${MARK}%`}`,
    ]);
    return rows as Array<{ client_id: string }>;
  }

  const baseDoc = (clientId: string, extra: Record<string, unknown> = {}) => ({
    clientId,
    category: 'other' as const,
    title: `${MARK} ${Math.round(Math.random() * 1e9)}`,
    fileName: 'file name (1).pdf',
    contentType: 'application/pdf',
    ...extra,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    documents = app.get(DocumentsService);
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    clientDb = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.CLIENT_DATABASE_URL ?? '' }),
    });
    await owner.document.deleteMany({ where: { title: { startsWith: MARK } } });
    await owner.auditEntry.deleteMany({ where: { resource: 'document' } });
  });

  afterAll(async () => {
    await owner.document.deleteMany({ where: { title: { startsWith: MARK } } });
    await owner.auditEntry.deleteMany({ where: { resource: 'document' } });
    await Promise.all([owner.$disconnect(), clientDb.$disconnect()]);
    await app.close();
  });

  it('staff create derives a per-client storage key, stores metadata + expiry, audits', async () => {
    const created = await documents.create(
      baseDoc(C1, {
        category: 'iqama',
        status: 'available',
        expiryDate: new Date('2027-03-15'),
        employeeId: 'e0000001-0000-4000-8000-000000000002',
      }),
    );
    // service-owned key: per-client prefix + object id + sanitized filename
    expect(created.storageKey).toMatch(
      new RegExp(`^clients/${C1}/documents/[0-9a-f-]+/file_name_1_\\.pdf$`),
    );
    expect(created.storageKey).not.toContain(' '); // sanitized

    const got = await documents.getById(created.id);
    expect(got?.category).toBe('iqama');
    expect(got?.expiryDate?.toISOString().slice(0, 10)).toBe('2027-03-15'); // date round-trip
    expect(got?.employeeId).toBe('e0000001-0000-4000-8000-000000000002');

    const audit = await owner.auditEntry.findMany({ where: { resource: 'document' } });
    expect(audit.some((e) => e.action === 'create' && e.clientId === C1)).toBe(true);
    // snapshot is non-sensitive metadata (no storage key / blob contents)
    const snapshots = JSON.stringify(audit.map((e) => [e.before, e.after]));
    expect(snapshots).not.toContain('storage');
    expect(snapshots).toContain('iqama'); // category IS recorded
  });

  it('staff see across clients; listByClient is scoped', async () => {
    await documents.create(baseDoc(C1));
    await documents.create(baseDoc(C2));
    const c1 = await documents.listByClient(C1);
    expect(c1.length).toBeGreaterThanOrEqual(1);
    expect(c1.every((d) => d.clientId === C1)).toBe(true);
    expect(c1.some((d) => d.clientId === C2)).toBe(false);
  });

  it('expiringOnOrBefore finds first-class expiries, excludes null + later + deleted', async () => {
    await documents.create(baseDoc(C1, { title: `${MARK} soon`, expiryDate: new Date('2026-01-31') }));
    await documents.create(baseDoc(C1, { title: `${MARK} later`, expiryDate: new Date('2030-01-01') }));
    await documents.create(baseDoc(C1, { title: `${MARK} none` })); // no expiry
    await documents.create(
      baseDoc(C1, { title: `${MARK} gone`, expiryDate: new Date('2025-01-01'), status: 'deleted' }),
    );

    const due = await documents.expiringOnOrBefore(new Date('2026-06-30'), C1);
    const titles = due.map((d) => d.title);
    expect(titles).toContain(`${MARK} soon`);
    expect(titles).not.toContain(`${MARK} later`); // after the cutoff
    expect(titles).not.toContain(`${MARK} none`); // no expiry
    expect(titles).not.toContain(`${MARK} gone`); // deleted excluded
    expect(due.every((d) => d.expiryDate !== null && d.expiryDate <= new Date('2026-06-30'))).toBe(true);
  });

  it('client-rep reads ONLY its own client’s documents (client_id-scoped RLS)', async () => {
    const rowsC1 = await readScoped(C1);
    expect(rowsC1.length).toBeGreaterThanOrEqual(1);
    expect(rowsC1.every((r) => r.client_id === C1)).toBe(true);
    expect(rowsC1.some((r) => r.client_id === C2)).toBe(false);
  });

  it('client-rep cannot write documents (no grant)', async () => {
    await expect(
      clientDb.$executeRawUnsafe(
        `INSERT INTO doc_documents (client_id, category, title, file_name, content_type, storage_key) VALUES ('${C1}', 'other', 'x', 'y', 'z', 'k')`,
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      clientDb.$executeRawUnsafe(`DELETE FROM doc_documents WHERE client_id = '${C1}'`),
    ).rejects.toThrow(/permission denied/i);
  });
});
