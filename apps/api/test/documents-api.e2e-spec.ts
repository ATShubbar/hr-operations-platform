import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { cleanupHelperUsers, loginAsStaff, type TestPrincipal,
  loginAsEnrolledStaff,
} from './helpers/login';

// DOC-02: the presigned upload flow — issue (pending metadata + PUT URL) →
// client transfers bytes directly to MinIO → confirm (blob verified → available).
// document.upload gates both; category scope (GRO → gov, Administrator/HR
// officer → all — v1.7) is enforced in-handler. Requires MinIO (docker compose).

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const MARK = 'DOC-02-test';

interface IssueBody {
  document: { id: string; status: string; sizeBytes: number | null };
  upload: { url: string; method: string; headers: Record<string, string> };
}

describe('Documents upload flow (DOC-02, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let hr: TestPrincipal; // document.upload — all categories
  let gro: TestPrincipal; // document.upload — government only
  let auditor: TestPrincipal; // NO document.upload (v1.7: reads only)

  const http = () => app.getHttpServer();

  const body = (extra: Record<string, unknown> = {}) => ({
    clientId: CLIENT_A,
    category: 'contract',
    title: `${MARK} ${Math.round(Math.random() * 1e9)}`,
    fileName: 'my file (final).pdf',
    contentType: 'application/pdf',
    ...extra,
  });

  const issue = (cookie: string, extra: Record<string, unknown> = {}) =>
    request(http()).post('/documents').set('Cookie', cookie).send(body(extra));

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
    gro = await loginAsStaff(app, 'gro_officer');
    auditor = await loginAsEnrolledStaff(app, 'auditor');
  });

  afterAll(async () => {
    await owner.document.deleteMany({ where: { title: { startsWith: MARK } } });
    await owner.auditEntry.deleteMany({ where: { resource: 'document' } });
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('issue → presigned PUT → confirm marks available with real size', async () => {
    const res = (await issue(hr.cookie, { expiryDate: '2027-01-01' }).expect(201)).body as IssueBody;
    expect(res.document.status).toBe('pending');
    expect(res.upload.method).toBe('PUT');
    expect(res.upload.url).toContain('X-Amz-Signature');

    const payload = Buffer.from('DOC-02 blob bytes');
    const put = await fetch(res.upload.url, {
      method: 'PUT',
      headers: res.upload.headers,
      body: payload,
    });
    expect(put.status).toBe(200);

    const confirmed = (
      await request(http())
        .post(`/documents/${res.document.id}/confirm`)
        .set('Cookie', hr.cookie)
        .expect(200)
    ).body as IssueBody['document'];
    expect(confirmed.status).toBe('available');
    expect(confirmed.sizeBytes).toBe(payload.byteLength);
  });

  it('confirm before the blob is uploaded → 400', async () => {
    const res = (await issue(hr.cookie).expect(201)).body as IssueBody;
    await request(http())
      .post(`/documents/${res.document.id}/confirm`)
      .set('Cookie', hr.cookie)
      .expect(400); // object not in storage
  });

  // ADR-013: the Recruiter seat became an HR officer, who writes EVERY category —
  // CVs included.
  it('category scope — HR officer: every category, CVs and government alike', async () => {
    await issue(hr.cookie, { category: 'cv' }).expect(201);
    await issue(hr.cookie, { category: 'iqama' }).expect(201);
  });

  it('category scope — GRO: government yes, recruitment no', async () => {
    await issue(gro.cookie, { category: 'iqama' }).expect(201);
    await issue(gro.cookie, { category: 'cv' }).expect(403);
  });

  it('a role without document.upload → 403', async () => {
    await issue(auditor.cookie).expect(403);
  });

  it('unknown client → 400; invalid payload → 400; unauthenticated → 401', async () => {
    await issue(hr.cookie, { clientId: '33333333-3333-4333-8333-333333333333' }).expect(400);
    await request(http()).post('/documents').set('Cookie', hr.cookie).send({}).expect(400);
    await request(http()).post('/documents').send(body()).expect(401);
  });

  it('the flow is audited (document.create + document.confirm)', async () => {
    const entries = await owner.auditEntry.findMany({ where: { resource: 'document' } });
    const actions = new Set(entries.map((e) => e.action));
    expect(actions.has('create')).toBe(true);
    expect(actions.has('confirm')).toBe(true);
  });
});
