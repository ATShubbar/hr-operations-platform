import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Job, Queue } from 'bullmq';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { EXPIRY_QUEUE } from '../src/modules/queue/public-api';
import {
  DAILY_SCAN_SCHEDULER_ID,
  DOCUMENT_EXPIRY_FLAG,
  ExpiryScanProcessor,
  ExpiryWorkerModule,
} from '../src/modules/document-expiry/public-api';
import {
  cleanupHelperUsers,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// EXP-02: the daily schedule + manual trigger. Opts the worker module in (like
// queue.e2e) so the scheduler bootstraps and the processor is drivable. We drive
// the processor directly for the flag-gate (no queue race) and hit the endpoint
// over HTTP for authz + the ops trigger.

const inDays = (n: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};

describe('Document-expiry schedule + trigger (EXP-02, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let queue: Queue;
  let processor: ExpiryScanProcessor;

  const clientTrigger = randomUUID();
  const clientFlag = randomUUID();

  const makeExpiringDoc = (clientId: string) =>
    owner.$executeRawUnsafe(
      `INSERT INTO doc_documents
        (id, client_id, category, title, file_name, content_type, storage_key, status, expiry_date, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, 'iqama'::"DocumentCategory", 'EXP-02 iqama', 'iqama.pdf',
               'application/pdf', $2, 'available'::"DocumentStatus", $3::date, now())`,
      clientId,
      `clients/${clientId}/iqama.pdf`,
      inDays(5).toISOString().slice(0, 10),
    );

  const setFlag = (on: boolean) =>
    owner.systemSetting.upsert({
      where: { key: DOCUMENT_EXPIRY_FLAG },
      create: { key: DOCUMENT_EXPIRY_FLAG, value: on },
      update: { value: on },
    });

  const alertCount = (clientId: string) => owner.expiryAlert.count({ where: { clientId } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, ExpiryWorkerModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    queue = app.get<Queue>(getQueueToken(EXPIRY_QUEUE));
    processor = app.get(ExpiryScanProcessor);

    await makeExpiringDoc(clientTrigger);
    // clientFlag's doc is created inside the flag-gate test itself — the manual
    // trigger runs a GLOBAL scan, so a doc created here would be claimed before
    // that test observes the flag-off no-op.
  });

  afterAll(async () => {
    await queue.removeJobScheduler(DAILY_SCAN_SCHEDULER_ID).catch(() => undefined);
    await owner.expiryAlert.deleteMany({ where: { clientId: { in: [clientTrigger, clientFlag] } } });
    await owner.document.deleteMany({ where: { clientId: { in: [clientTrigger, clientFlag] } } });
    await owner.systemSetting.deleteMany({ where: { key: DOCUMENT_EXPIRY_FLAG } });
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close(); // must return promptly — proves the worker closed
  });

  it('registers the daily repeatable scan on bootstrap', async () => {
    const schedulers = await queue.getJobSchedulers();
    const daily = schedulers.find((s) => s.key === DAILY_SCAN_SCHEDULER_ID);
    expect(daily).toBeDefined();
    expect(daily?.pattern).toBe('0 6 * * *');
    expect(daily?.tz).toBe('Asia/Riyadh');
  });

  it('POST /expiry/scan runs the scan for an admin and returns a summary', async () => {
    const admin = await loginAsEnrolledStaff(app, 'company_admin');
    expect(await alertCount(clientTrigger)).toBe(0);

    const res = await request(app.getHttpServer())
      .post('/expiry/scan')
      .set('Cookie', admin.cookie)
      .expect(200);

    expect(res.body).toMatchObject({
      scanned: expect.any(Number),
      alertsRaised: expect.any(Number),
      notificationsSent: expect.any(Number),
    });
    // the manual trigger is NOT flag-gated — it raised the tier for our doc
    expect(await alertCount(clientTrigger)).toBe(1);
  });

  it('POST /expiry/scan is admin-only (403) and rejects unauthenticated (401)', async () => {
    const nonAdmin: TestPrincipal = await loginAsStaff(app, 'hr_officer');
    await request(app.getHttpServer())
      .post('/expiry/scan')
      .set('Cookie', nonAdmin.cookie)
      .expect(403);
    await request(app.getHttpServer()).post('/expiry/scan').expect(401);
  });

  it('the scheduled processor is flag-gated: off → no-op, on → runs', async () => {
    const job = {} as unknown as Job;
    await makeExpiringDoc(clientFlag);

    await setFlag(false);
    await processor.process(job);
    expect(await alertCount(clientFlag)).toBe(0); // flag off → nothing raised

    await setFlag(true);
    await processor.process(job);
    expect(await alertCount(clientFlag)).toBe(1); // flag on → tier raised
  });
});
