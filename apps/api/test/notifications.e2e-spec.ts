import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { NotificationsService } from '../src/modules/notifications/public-api';
import { cleanupHelperUsers, loginAsStaff, type TestPrincipal } from './helpers/login';

// NOTIF-02: in-app notifications. notify() (the producer entry point) writes a
// per-user record; the read/mark-read API is self-service — a user only ever
// sees/touches their OWN (application-enforced by the actor from the session).

const MARK = 'NOTIF-02-test';

interface Notif {
  id: string;
  title: { ar: string; en: string };
  readAt: string | null;
}
interface ListBody {
  notifications: Notif[];
  unreadCount: number;
}

describe('In-app notifications (NOTIF-02, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let service: NotificationsService;
  let alice: TestPrincipal;
  let bob: TestPrincipal;

  const http = () => app.getHttpServer();
  const listAs = (cookie: string, qs = '') =>
    request(http()).get(`/notifications${qs}`).set('Cookie', cookie);

  const notify = (userId: string, en: string) =>
    service.notify({
      recipientUserId: userId,
      category: 'general',
      title: { ar: 'إشعار', en: `${MARK} ${en}` },
      body: { ar: 'محتوى', en: 'body' },
    });

  const clear = (userId: string) =>
    owner.notification.deleteMany({ where: { recipientUserId: userId } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    service = app.get(NotificationsService);
    alice = await loginAsStaff(app, 'hr_officer');
    bob = await loginAsStaff(app, 'read_only');
  });

  afterAll(async () => {
    await owner.notification.deleteMany({ where: { titleEn: { startsWith: MARK } } });
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('notify() delivers in-app to the recipient; another user never sees it', async () => {
    await clear(alice.userId);
    await clear(bob.userId);
    const created = await notify(alice.userId, 'hello');

    const a = (await listAs(alice.cookie).expect(200)).body as ListBody;
    expect(a.notifications.some((n) => n.id === created.id)).toBe(true);
    expect(a.unreadCount).toBe(1);
    expect(a.notifications[0]?.title.en).toBe(`${MARK} hello`);

    const b = (await listAs(bob.cookie).expect(200)).body as ListBody;
    expect(b.notifications.some((n) => n.id === created.id)).toBe(false);
    expect(b.unreadCount).toBe(0);
  });

  it('mark one read; the unread filter and count reflect it', async () => {
    await clear(alice.userId);
    const n1 = await notify(alice.userId, 'one');
    await notify(alice.userId, 'two');
    expect(((await listAs(alice.cookie).expect(200)).body as ListBody).unreadCount).toBe(2);

    const read = (
      await request(http()).post(`/notifications/${n1.id}/read`).set('Cookie', alice.cookie).expect(200)
    ).body as Notif;
    expect(read.readAt).not.toBeNull();

    const after = (await listAs(alice.cookie).expect(200)).body as ListBody;
    expect(after.unreadCount).toBe(1);
    const unreadOnly = (await listAs(alice.cookie, '?unread=true').expect(200)).body as ListBody;
    expect(unreadOnly.notifications.every((n) => n.readAt === null)).toBe(true);
    expect(unreadOnly.notifications.some((n) => n.id === n1.id)).toBe(false);
  });

  it('mark all read clears the unread count', async () => {
    await clear(alice.userId);
    await notify(alice.userId, 'a');
    await notify(alice.userId, 'b');
    const res = (
      await request(http()).post('/notifications/read-all').set('Cookie', alice.cookie).expect(200)
    ).body as { updated: number };
    expect(res.updated).toBe(2);
    expect(((await listAs(alice.cookie).expect(200)).body as ListBody).unreadCount).toBe(0);
  });

  it("cannot mark another user's notification read → 404", async () => {
    const forAlice = await notify(alice.userId, 'private');
    await request(http()).post(`/notifications/${forAlice.id}/read`).set('Cookie', bob.cookie).expect(404);
    // still unread for alice (bob's attempt did nothing)
    const a = await service.markRead(alice.userId, forAlice.id);
    expect(a?.readAt).not.toBeNull();
  });

  it('unauthenticated → 401', async () => {
    await request(http()).get('/notifications').expect(401);
  });
});
