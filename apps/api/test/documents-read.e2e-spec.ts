import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { cleanupHelperUsers, loginAsStaff, type TestPrincipal } from './helpers/login';

// DOC-03: read side — list/filter (incl. by expiry), get, presigned download,
// delete (blob removal + soft-delete). Requires MinIO (docker compose).

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const MARK = 'DOC-03-test';

interface Doc {
  id: string;
  category: string;
  status: string;
  expiryDate: string | null;
}

describe('Documents read/download/delete (DOC-03, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let hr: TestPrincipal; // read + upload/delete all
  let recruiter: TestPrincipal; // read + upload/delete recruitment only
  let finance: TestPrincipal; // read only

  const http = () => app.getHttpServer();

  async function issue(cookie: string, extra: Record<string, unknown> = {}): Promise<{
    id: string;
    uploadUrl: string;
    headers: Record<string, string>;
  }> {
    const res = (
      await request(http())
        .post('/documents')
        .set('Cookie', cookie)
        .send({
          clientId: CLIENT_A,
          category: 'contract',
          title: `${MARK} ${Math.round(Math.random() * 1e9)}`,
          fileName: 'f.pdf',
          contentType: 'application/pdf',
          ...extra,
        })
        .expect(201)
    ).body as { document: { id: string }; upload: { url: string; headers: Record<string, string> } };
    return { id: res.document.id, uploadUrl: res.upload.url, headers: res.upload.headers };
  }

  async function createAvailable(extra: Record<string, unknown> = {}): Promise<string> {
    const { id, uploadUrl, headers } = await issue(hr.cookie, extra);
    await fetch(uploadUrl, { method: 'PUT', headers, body: Buffer.from('doc bytes') });
    await request(http()).post(`/documents/${id}/confirm`).set('Cookie', hr.cookie).expect(200);
    return id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    await owner.document.deleteMany({ where: { title: { startsWith: MARK } } });
    await owner.auditEntry.deleteMany({ where: { resource: 'document' } });
    hr = await loginAsStaff(app, 'hr_officer');
    recruiter = await loginAsStaff(app, 'recruiter');
    finance = await loginAsStaff(app, 'finance');
  });

  afterAll(async () => {
    await owner.document.deleteMany({ where: { title: { startsWith: MARK } } });
    await owner.auditEntry.deleteMany({ where: { resource: 'document' } });
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('list filters by client, category, and expiry', async () => {
    await createAvailable({ category: 'contract', expiryDate: '2030-01-01' });
    const iqama = await createAvailable({ category: 'iqama', expiryDate: '2026-02-01' });

    const all = (await request(http()).get(`/documents?clientId=${CLIENT_A}`).set('Cookie', hr.cookie).expect(200))
      .body.documents as Doc[];
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all.every((d) => d.status !== 'deleted')).toBe(true);

    const iqamas = (await request(http()).get(`/documents?category=iqama`).set('Cookie', hr.cookie).expect(200))
      .body.documents as Doc[];
    expect(iqamas.every((d) => d.category === 'iqama')).toBe(true);

    const due = (await request(http()).get(`/documents?expiringBefore=2026-06-30`).set('Cookie', hr.cookie).expect(200))
      .body.documents as Doc[];
    expect(due.some((d) => d.id === iqama)).toBe(true); // 2026-02-01 is due
    expect(due.every((d) => d.expiryDate !== null && d.expiryDate <= '2026-06-30T23:59:59.999Z')).toBe(true);
  });

  it('get by id (finance has document.read); unknown → 404', async () => {
    const id = await createAvailable();
    const got = (await request(http()).get(`/documents/${id}`).set('Cookie', finance.cookie).expect(200))
      .body as Doc;
    expect(got.id).toBe(id);
    await request(http())
      .get('/documents/33333333-3333-4333-8333-333333333333')
      .set('Cookie', hr.cookie)
      .expect(404);
  });

  it('download: available → presigned GET serves the bytes; pending → 409', async () => {
    const id = await createAvailable();
    const dl = (await request(http()).get(`/documents/${id}/download`).set('Cookie', hr.cookie).expect(200))
      .body as { url: string; method: string };
    expect(dl.method).toBe('GET');
    const got = await fetch(dl.url);
    expect(got.status).toBe(200);
    expect((await got.text())).toBe('doc bytes');

    // a pending document (issued, never confirmed) is not downloadable
    const pending = await issue(hr.cookie);
    await request(http()).get(`/documents/${pending.id}/download`).set('Cookie', hr.cookie).expect(409);
  });

  it('delete removes the blob + soft-deletes; category-scoped; audited', async () => {
    const id = await createAvailable({ category: 'iqama' });

    // recruiter may not delete a government doc (category scope)
    await request(http()).delete(`/documents/${id}`).set('Cookie', recruiter.cookie).expect(403);
    // finance has no document.delete at all
    await request(http()).delete(`/documents/${id}`).set('Cookie', finance.cookie).expect(403);

    const del = (await request(http()).delete(`/documents/${id}`).set('Cookie', hr.cookie).expect(200))
      .body as Doc;
    expect(del.status).toBe('deleted');

    // blob is gone → no longer downloadable; excluded from the default list
    await request(http()).get(`/documents/${id}/download`).set('Cookie', hr.cookie).expect(409);
    const list = (await request(http()).get(`/documents?clientId=${CLIENT_A}`).set('Cookie', hr.cookie).expect(200))
      .body.documents as Doc[];
    expect(list.some((d) => d.id === id)).toBe(false);

    const audit = await owner.auditEntry.findMany({ where: { resource: 'document' } });
    expect(audit.some((e) => e.action === 'delete')).toBe(true);
  });

  it('unauthenticated list → 401', async () => {
    await request(http()).get('/documents').expect(401);
  });
});
