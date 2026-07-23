import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  CaptureEmailTransport,
  EMAIL_TRANSPORT,
  NotificationDispatchService,
  NotificationsWorkerModule,
} from '../src/modules/notifications/public-api';
import { cleanupHelperUsers, loginAsStaff, type TestPrincipal } from './helpers/login';

// NOTIF-04: per-user notification email preferences. The HTTP surface (GET/PATCH
// /notifications/preferences) is exercised over supertest; the dispatch GATE is
// proven by driving the dispatch SERVICE directly (deterministic — no race with a
// running dev worker on the shared queue; the queue path is covered elsewhere).

const MARK = 'NOTIF-04-test';

describe('Notification preferences (NOTIF-04, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let dispatchSvc: NotificationDispatchService;
  let mail: CaptureEmailTransport;
  let alice: TestPrincipal;
  let bob: TestPrincipal;

  const makeNotif = (recipientUserId: string, category: 'document_expiry' | 'task') =>
    owner.notification.create({
      data: {
        recipientUserId,
        category,
        titleAr: `${MARK} ${category}`,
        titleEn: `${MARK} ${category}`,
        bodyAr: 'محتوى',
        bodyEn: 'body',
      },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, NotificationsWorkerModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    dispatchSvc = app.get(NotificationDispatchService);
    mail = app.get<CaptureEmailTransport>(EMAIL_TRANSPORT);
    alice = await loginAsStaff(app, 'hr_officer');
    bob = await loginAsStaff(app, 'gro_officer');
  });

  afterAll(async () => {
    await owner.notificationPreference.deleteMany({
      where: { userId: { in: [alice.userId, bob.userId] } },
    });
    await owner.notification.deleteMany({ where: { titleEn: { startsWith: MARK } } });
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('defaults to email enabled for every category', async () => {
    const res = await request(app.getHttpServer())
      .get('/notifications/preferences')
      .set('Cookie', alice.cookie)
      .expect(200);
    expect(res.body.email).toEqual({
      document_expiry: true,
      task: true,
      request: true,
      general: true,
      system: true,
    });
  });

  it('PATCH toggles one category and persists; others stay enabled', async () => {
    const patch = await request(app.getHttpServer())
      .patch('/notifications/preferences/document_expiry')
      .set('Cookie', alice.cookie)
      .send({ emailEnabled: false })
      .expect(200);
    expect(patch.body.email.document_expiry).toBe(false);
    expect(patch.body.email.task).toBe(true);

    const get = await request(app.getHttpServer())
      .get('/notifications/preferences')
      .set('Cookie', alice.cookie)
      .expect(200);
    expect(get.body.email.document_expiry).toBe(false);
    expect(get.body.email.general).toBe(true);
  });

  it('rejects an unknown category (404) and a bad payload (400)', async () => {
    await request(app.getHttpServer())
      .patch('/notifications/preferences/not_a_category')
      .set('Cookie', alice.cookie)
      .send({ emailEnabled: false })
      .expect(404);
    await request(app.getHttpServer())
      .patch('/notifications/preferences/task')
      .set('Cookie', alice.cookie)
      .send({ nope: true })
      .expect(400);
  });

  it('dispatch suppresses email for a disabled category but sends for an enabled one', async () => {
    // alice disabled document_expiry above; task is still enabled.
    const suppressed = await makeNotif(alice.userId, 'document_expiry');
    const sent = await makeNotif(alice.userId, 'task');
    await dispatchSvc.dispatch(suppressed.id);
    await dispatchSvc.dispatch(sent.id);

    // in-app records exist for BOTH — the preference only gates email.
    expect(await owner.notification.findUnique({ where: { id: suppressed.id } })).not.toBeNull();

    const mails = mail.forRecipient(alice.email);
    expect(mails.length).toBe(1); // only the 'task' notification produced mail
    expect(mails[0]?.subject).toBe(`${MARK} task`);
  });

  it('preferences are per-user — one user’s change does not leak to another', async () => {
    const res = await request(app.getHttpServer())
      .get('/notifications/preferences')
      .set('Cookie', bob.cookie)
      .expect(200);
    expect(res.body.email.document_expiry).toBe(true); // bob unaffected by alice
  });

  it('rejects unauthenticated callers (401)', async () => {
    await request(app.getHttpServer()).get('/notifications/preferences').expect(401);
    await request(app.getHttpServer())
      .patch('/notifications/preferences/task')
      .send({ emailEnabled: false })
      .expect(401);
  });
});
