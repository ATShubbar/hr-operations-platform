import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { cleanupHelperUsers, loginAsClientRep, loginAsStaff, type TestPrincipal } from './helpers/login';

// PORTAL-01: the client portal foundation. GET /portal/company returns the
// caller's OWN company, only when flag.client-self-service is on; it's a
// client-only surface (staff lack portal.read → 403).

const FLAG = 'flag.client-self-service';

describe('Client portal — /portal/company (PORTAL-01, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let clientA: string;
  let clientB: string;
  let repA: TestPrincipal;
  let repB: TestPrincipal;
  let staff: TestPrincipal;

  const setFlag = (clientId: string, on: boolean) =>
    owner.clientSetting.upsert({
      where: { clientId_key: { clientId, key: FLAG } },
      create: { clientId, key: FLAG, value: on },
      update: { value: on },
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
      data: { nameAr: 'شركة أ للبوابة', nameEn: 'PORTAL Client A', status: 'active' },
    });
    const cB = await owner.client.create({
      data: { nameAr: 'شركة ب للبوابة', nameEn: 'PORTAL Client B', status: 'active' },
    });
    clientA = cA.id;
    clientB = cB.id;
    repA = await loginAsClientRep(app, clientA, 'client_admin');
    repB = await loginAsClientRep(app, clientB, 'client_user');
    staff = await loginAsStaff(app, 'hr_officer');
  });

  afterAll(async () => {
    await owner.clientSetting.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await cleanupHelperUsers(app);
    await owner.client.deleteMany({ where: { id: { in: [clientA, clientB] } } });
    await owner.$disconnect();
    await app.close();
  });

  it('is blocked (403) while flag.client-self-service is off', async () => {
    await request(http).get('/portal/company').set('Cookie', repA.cookie).expect(403);
  });

  it('with the flag on, each rep gets ONLY their own company', async () => {
    await setFlag(clientA, true);
    await setFlag(clientB, true);

    const a = await request(http).get('/portal/company').set('Cookie', repA.cookie).expect(200);
    expect(a.body.id).toBe(clientA);
    expect(a.body.name.en).toBe('PORTAL Client A');

    const b = await request(http).get('/portal/company').set('Cookie', repB.cookie).expect(200);
    expect(b.body.id).toBe(clientB);
  });

  it('is client-only — staff lack portal.read (403)', async () => {
    await request(http).get('/portal/company').set('Cookie', staff.cookie).expect(403);
  });

  it('rejects unauthenticated callers (401)', async () => {
    await request(http).get('/portal/company').expect(401);
  });
});
