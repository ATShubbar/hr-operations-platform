import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
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

// NOTIF-03: email delivery. We drive the dispatch SERVICE directly (render +
// send) rather than the queue, so the test doesn't race the running dev worker
// on the shared 'dispatch' queue. The queue→worker roundtrip itself is proven by
// queue.e2e; here we prove the render (ar/en per recipient language) + transport.

const MARK = 'NOTIF-03-test';

describe('Notification email dispatch (NOTIF-03, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let dispatchSvc: NotificationDispatchService;
  let mail: CaptureEmailTransport;
  let arUser: TestPrincipal; // default language (ar)
  let enUser: TestPrincipal; // ui.language override = en

  const makeNotif = (recipientUserId: string) =>
    owner.notification.create({
      data: {
        recipientUserId,
        category: 'document_expiry',
        titleAr: `${MARK} انتهاء الإقامة`,
        titleEn: `${MARK} Iqama expiring`,
        bodyAr: 'تنتهي إقامة الموظف قريباً.',
        bodyEn: "The employee's iqama expires soon.",
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
    arUser = await loginAsStaff(app, 'hr_officer');
    enUser = await loginAsStaff(app, 'gro_officer');
    // enUser prefers English
    await owner.userSetting.create({
      data: { userId: enUser.userId, key: 'ui.language', value: 'en' },
    });
  });

  afterAll(async () => {
    await owner.notification.deleteMany({ where: { titleEn: { startsWith: MARK } } });
    await owner.userSetting.deleteMany({ where: { userId: enUser.userId } });
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('renders + sends in the recipient default language (Arabic)', async () => {
    const n = await makeNotif(arUser.userId);
    await dispatchSvc.dispatch(n.id);

    const mails = mail.forRecipient(arUser.email);
    expect(mails.length).toBe(1);
    expect(mails[0]?.subject).toBe(`${MARK} انتهاء الإقامة`); // Arabic title
    expect(mails[0]?.text).toContain('تنتهي إقامة الموظف قريباً.'); // Arabic body
    expect(mails[0]?.text).toContain('مرحباً'); // Arabic framing
  });

  it("renders + sends in the recipient's chosen language (English via ui.language)", async () => {
    const n = await makeNotif(enUser.userId);
    await dispatchSvc.dispatch(n.id);

    const mails = mail.forRecipient(enUser.email);
    expect(mails.length).toBe(1);
    expect(mails[0]?.subject).toBe(`${MARK} Iqama expiring`); // English title
    expect(mails[0]?.text).toContain("The employee's iqama expires soon."); // English body
    expect(mails[0]?.text).toContain('Hello,'); // English framing
  });

  it('a missing notification is a no-op (no throw, no email)', async () => {
    const before = mail.sent.length;
    await dispatchSvc.dispatch('33333333-3333-4333-8333-333333333333');
    expect(mail.sent.length).toBe(before);
  });
});
