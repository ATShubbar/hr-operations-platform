import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { ExpiryScanService } from '../src/modules/document-expiry/public-api';
import { cleanupHelperUsers, loginAsStaff, type TestPrincipal } from './helpers/login';

// EXP-01: the document-expiry scan engine. We drive ExpiryScanService.scan()
// directly (deterministic) — the daily schedule + trigger endpoint are EXP-02.
// Documents/alerts are keyed to a synthetic client id so the ledger assertions
// are exact regardless of other rows in the DB; per-recipient notification
// attribution is done via data.documentId against freshly-created staff users.

// All dates are UTC calendar days off 2026-08-01 (the scan reference).
const day = (n: number) => new Date(Date.UTC(2026, 7, 1 + n));
const ASOF = day(0);
const ASOF_LATER = day(20);
const clientId = randomUUID();

describe('Document-expiry scan (EXP-01, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let scan: ExpiryScanService;

  let hr: TestPrincipal; // hr_officer — manages all categories
  let gro: TestPrincipal; // gro_officer — government docs only
  let recruiter: TestPrincipal; // recruiter — CVs only
  let staffIds: string[];

  // documents under test (all share the synthetic client)
  const docIqama = randomUUID(); // day+25 → tier 30; gov → hr+gro
  const docCv = randomUUID(); // day+3 → tier 7; cv → hr+recruiter
  const docContract = randomUUID(); // day-2 → tier 0 (expired); → hr
  const docFar = randomUUID(); // day+90 → outside window → no alert
  const docDeleted = randomUUID(); // day+5 but deleted → excluded

  const makeDoc = (id: string, category: string, expiry: Date, status = 'available') =>
    owner.$executeRawUnsafe(
      `INSERT INTO doc_documents
        (id, client_id, category, title, file_name, content_type, storage_key, status, expiry_date, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::"DocumentCategory", $4, $5, $6, $7, $8::"DocumentStatus", $9::date, now())`,
      id,
      clientId,
      category,
      `EXP-01 ${category}`,
      `${category}.pdf`,
      'application/pdf',
      `clients/${clientId}/${category}/${id}.pdf`,
      status,
      expiry.toISOString().slice(0, 10),
    );

  // Notifications delivered to one of our staff for a specific document.
  const notifsFor = (recipientUserId: string, documentId: string) =>
    owner.notification.findMany({
      where: { recipientUserId, data: { path: ['documentId'], equals: documentId } },
      orderBy: { createdAt: 'asc' },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    scan = app.get(ExpiryScanService);

    hr = await loginAsStaff(app, 'hr_officer');
    gro = await loginAsStaff(app, 'gro_officer');
    recruiter = await loginAsStaff(app, 'recruiter');
    staffIds = [hr.userId, gro.userId, recruiter.userId];

    await makeDoc(docIqama, 'iqama', day(25));
    await makeDoc(docCv, 'cv', day(3));
    await makeDoc(docContract, 'contract', day(-2));
    await makeDoc(docFar, 'iqama', day(90));
    await makeDoc(docDeleted, 'iqama', day(5), 'deleted');
  });

  afterAll(async () => {
    await owner.notification.deleteMany({ where: { recipientUserId: { in: staffIds } } });
    await owner.expiryAlert.deleteMany({ where: { clientId } });
    await owner.document.deleteMany({ where: { clientId } });
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('raises one alert per (document, crossed tier) with correct recipients', async () => {
    await scan.scan(ASOF);

    // Ledger: exactly the three in-window, non-deleted documents, each at its tier.
    const ledger = await owner.expiryAlert.findMany({ where: { clientId } });
    const byDoc = Object.fromEntries(ledger.map((a) => [a.documentId, a.threshold]));
    expect(ledger.length).toBe(3);
    expect(byDoc[docIqama]).toBe(30);
    expect(byDoc[docCv]).toBe(7);
    expect(byDoc[docContract]).toBe(0);
    expect(byDoc[docFar]).toBeUndefined(); // beyond the widest window
    expect(byDoc[docDeleted]).toBeUndefined(); // deleted → excluded

    // Recipients follow category→role: iqama → hr + gro (not recruiter).
    expect((await notifsFor(hr.userId, docIqama)).length).toBe(1);
    expect((await notifsFor(gro.userId, docIqama)).length).toBe(1);
    expect((await notifsFor(recruiter.userId, docIqama)).length).toBe(0);

    // cv → hr + recruiter (not gro).
    expect((await notifsFor(hr.userId, docCv)).length).toBe(1);
    expect((await notifsFor(recruiter.userId, docCv)).length).toBe(1);
    expect((await notifsFor(gro.userId, docCv)).length).toBe(0);

    // contract (expired) → hr only; the message is the "expired" variant.
    const contractNotifs = await notifsFor(hr.userId, docContract);
    expect(contractNotifs.length).toBe(1);
    expect(contractNotifs[0]?.titleEn).toContain('expired');
    expect((await notifsFor(gro.userId, docContract)).length).toBe(0);
  });

  it('is idempotent — a second scan on the same day raises nothing new', async () => {
    const before = await owner.notification.count({ where: { recipientUserId: { in: staffIds } } });
    const result = await scan.scan(ASOF);
    const after = await owner.notification.count({ where: { recipientUserId: { in: staffIds } } });

    // Our documents contribute no new ledger rows or notifications.
    expect(await owner.expiryAlert.count({ where: { clientId } })).toBe(3);
    expect(after).toBe(before);
    // (result.alertsRaised counts globally; our slice is provably unchanged above.)
    expect(result.alertsRaised).toBeGreaterThanOrEqual(0);
  });

  it('escalates — a later scan crossing the next tier raises exactly one new alert', async () => {
    // At ASOF_LATER (day+20) the iqama doc (expiry day+25) is 5 days out → tier 7.
    const beforeIqama = (await notifsFor(gro.userId, docIqama)).length;
    await scan.scan(ASOF_LATER);

    const iqamaTiers = (
      await owner.expiryAlert.findMany({ where: { clientId, documentId: docIqama } })
    )
      .map((a) => a.threshold)
      .sort((a, b) => a - b);
    // tier 30 (from the first scan) survives; tier 7 is newly added — never refired 30.
    expect(iqamaTiers).toEqual([7, 30]);

    // gro receives one additional iqama notification (the tier-7 alert).
    const afterIqama = await notifsFor(gro.userId, docIqama);
    expect(afterIqama.length).toBe(beforeIqama + 1);
    expect(afterIqama.at(-1)?.data).toMatchObject({ threshold: 7, documentId: docIqama });
  });
});
