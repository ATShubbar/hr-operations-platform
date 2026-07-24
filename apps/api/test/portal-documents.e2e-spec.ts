import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { cleanupHelperUsers, loginAsClientRep, loginAsStaff, type TestPrincipal } from './helpers/login';

// PORTAL-03: a client rep lists + downloads their OWN documents through the
// portal. Deliberately narrower than staff: only AVAILABLE documents are
// surfaced (never pending uploads or quarantined blobs). Cross-client / non-
// available / unknown ids are a uniform 404 (no existence or state leak). The
// download returns a short-lived presigned GET URL scoped to the per-client
// storage key. Staff lack portal.read (403); the surface is flag-gated.

const FLAG = 'flag.client-self-service';

describe('Client portal — /portal/documents (PORTAL-03, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let clientA: string;
  let clientB: string;
  let availA: string;
  let pendingA: string;
  let quarantinedA: string;
  let availB: string;
  let repA: TestPrincipal;
  let repB: TestPrincipal;
  let staff: TestPrincipal;

  const setFlag = (clientId: string, on: boolean) =>
    owner.clientSetting.upsert({
      where: { clientId_key: { clientId, key: FLAG } },
      create: { clientId, key: FLAG, value: on },
      update: { value: on },
    });

  const seedDoc = (clientId: string, title: string, status: 'available' | 'pending' | 'quarantined') =>
    owner.document.create({
      data: {
        clientId,
        category: 'contract',
        title,
        fileName: `${title}.pdf`,
        contentType: 'application/pdf',
        sizeBytes: 1024,
        storageKey: `clients/${clientId}/documents/${title}.pdf`,
        status,
      },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    http = app.getHttpServer();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    const cA = await owner.client.create({
      data: { nameAr: 'شركة أ للوثائق', nameEn: 'PORTAL-DOC Client A', status: 'active' },
    });
    const cB = await owner.client.create({
      data: { nameAr: 'شركة ب للوثائق', nameEn: 'PORTAL-DOC Client B', status: 'active' },
    });
    clientA = cA.id;
    clientB = cB.id;
    availA = (await seedDoc(clientA, 'A-available', 'available')).id;
    pendingA = (await seedDoc(clientA, 'A-pending', 'pending')).id;
    quarantinedA = (await seedDoc(clientA, 'A-quarantined', 'quarantined')).id;
    availB = (await seedDoc(clientB, 'B-available', 'available')).id;
    repA = await loginAsClientRep(app, clientA, 'client_admin');
    repB = await loginAsClientRep(app, clientB, 'client_user');
    staff = await loginAsStaff(app, 'hr_officer');
  });

  afterAll(async () => {
    await owner.document.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await owner.clientSetting.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await cleanupHelperUsers(app);
    await owner.client.deleteMany({ where: { id: { in: [clientA, clientB] } } });
    await owner.$disconnect();
    await app.close();
  });

  it('is blocked (403) while flag.client-self-service is off', async () => {
    await request(http).get('/portal/documents').set('Cookie', repA.cookie).expect(403);
  });

  it('lists ONLY the caller own client AVAILABLE documents', async () => {
    await setFlag(clientA, true);
    await setFlag(clientB, true);

    const a = await request(http).get('/portal/documents').set('Cookie', repA.cookie).expect(200);
    const ids = a.body.documents.map((d: { id: string }) => d.id);
    expect(ids).toEqual([availA]); // available only — pending + quarantined excluded
    expect(ids).not.toContain(pendingA);
    expect(ids).not.toContain(quarantinedA);

    const b = await request(http).get('/portal/documents').set('Cookie', repB.cookie).expect(200);
    expect(b.body.documents.map((d: { id: string }) => d.id)).toEqual([availB]);
  });

  it('GET :id returns an own available document metadata', async () => {
    const res = await request(http)
      .get(`/portal/documents/${availA}`)
      .set('Cookie', repA.cookie)
      .expect(200);
    expect(res.body.id).toBe(availA);
    expect(res.body.clientId).toBe(clientA);
    expect(res.body.status).toBe('available');
  });

  it('GET :id for a non-available own document is 404 (no state leak)', async () => {
    await request(http).get(`/portal/documents/${pendingA}`).set('Cookie', repA.cookie).expect(404);
    await request(http).get(`/portal/documents/${quarantinedA}`).set('Cookie', repA.cookie).expect(404);
  });

  it('GET :id for another client document is 404 (existence not leaked)', async () => {
    await request(http).get(`/portal/documents/${availB}`).set('Cookie', repA.cookie).expect(404);
  });

  it('GET :id for an unknown id is 404', async () => {
    await request(http)
      .get('/portal/documents/00000000-0000-4000-8000-000000000000')
      .set('Cookie', repA.cookie)
      .expect(404);
  });

  it('download returns a short-lived presigned GET URL for an own available document', async () => {
    const res = await request(http)
      .get(`/portal/documents/${availA}/download`)
      .set('Cookie', repA.cookie)
      .expect(200);
    expect(res.body.method).toBe('GET');
    expect(res.body.expiresInSeconds).toBe(300);
    expect(typeof res.body.url).toBe('string');
    expect(res.body.url).toContain(`clients/${clientA}/documents/`);
  });

  it('download for a non-available or cross-client document is 404', async () => {
    await request(http).get(`/portal/documents/${pendingA}/download`).set('Cookie', repA.cookie).expect(404);
    await request(http).get(`/portal/documents/${availB}/download`).set('Cookie', repA.cookie).expect(404);
  });

  it('is client-only — staff lack portal.read (403)', async () => {
    await request(http).get('/portal/documents').set('Cookie', staff.cookie).expect(403);
  });

  it('rejects unauthenticated callers (401)', async () => {
    await request(http).get('/portal/documents').expect(401);
    await request(http).get(`/portal/documents/${availA}`).expect(401);
    await request(http).get(`/portal/documents/${availA}/download`).expect(401);
  });
});
