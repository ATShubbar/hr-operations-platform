import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { EICAR_TEST_SIGNATURE } from '../src/modules/documents/public-api';
import { cleanupHelperUsers, loginAsStaff, type TestPrincipal } from './helpers/login';

// DOC-04: virus-scan hook (dev pass-through flags EICAR) + legal-hold retention.
// Requires MinIO (docker compose).

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const MARK = 'DOC-04-test';

interface Doc {
  id: string;
  status: string;
  legalHold: boolean;
}

describe('Documents virus scan + legal hold (DOC-04, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let hr: TestPrincipal;

  const http = () => app.getHttpServer();

  // Issue → PUT the given bytes to storage → confirm; returns the confirm body.
  async function uploadAndConfirm(bytes: Buffer): Promise<Doc> {
    const issued = (
      await request(http())
        .post('/documents')
        .set('Cookie', hr.cookie)
        .send({
          clientId: CLIENT_A,
          category: 'contract',
          title: `${MARK} ${Math.round(Math.random() * 1e9)}`,
          fileName: 'f.bin',
          contentType: 'application/octet-stream',
        })
        .expect(201)
    ).body as { document: { id: string }; upload: { url: string; headers: Record<string, string> } };
    await fetch(issued.upload.url, { method: 'PUT', headers: issued.upload.headers, body: bytes });
    return (
      await request(http())
        .post(`/documents/${issued.document.id}/confirm`)
        .set('Cookie', hr.cookie)
        .expect(200)
    ).body as Doc;
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
  });

  afterAll(async () => {
    await owner.document.deleteMany({ where: { title: { startsWith: MARK } } });
    await owner.auditEntry.deleteMany({ where: { resource: 'document' } });
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('a clean upload passes the scan → available', async () => {
    const doc = await uploadAndConfirm(Buffer.from('perfectly harmless bytes'));
    expect(doc.status).toBe('available');
  });

  it('an EICAR upload is quarantined and the blob removed', async () => {
    const doc = await uploadAndConfirm(Buffer.from(EICAR_TEST_SIGNATURE));
    expect(doc.status).toBe('quarantined');
    // not downloadable (blob gone, status not available)
    await request(http()).get(`/documents/${doc.id}/download`).set('Cookie', hr.cookie).expect(409);
  });

  it('legal hold blocks deletion until released', async () => {
    const doc = await uploadAndConfirm(Buffer.from('to be held'));

    const held = (
      await request(http())
        .post(`/documents/${doc.id}/legal-hold`)
        .set('Cookie', hr.cookie)
        .send({ held: true })
        .expect(200)
    ).body as Doc;
    expect(held.legalHold).toBe(true);

    // cannot delete while held
    await request(http()).delete(`/documents/${doc.id}`).set('Cookie', hr.cookie).expect(409);

    // release the hold, then delete succeeds
    await request(http())
      .post(`/documents/${doc.id}/legal-hold`)
      .set('Cookie', hr.cookie)
      .send({ held: false })
      .expect(200);
    const del = (await request(http()).delete(`/documents/${doc.id}`).set('Cookie', hr.cookie).expect(200))
      .body as Doc;
    expect(del.status).toBe('deleted');
  });

  it('scan + hold actions are audited', async () => {
    const entries = await owner.auditEntry.findMany({ where: { resource: 'document' } });
    const actions = new Set(entries.map((e) => e.action));
    expect(actions.has('quarantine')).toBe(true);
    expect(actions.has('legal-hold')).toBe(true);
    expect(actions.has('legal-release')).toBe(true);
  });
});
