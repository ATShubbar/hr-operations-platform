import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { EventBus } from '../src/modules/events/public-api';
import { DocumentExpiringEvent } from '../src/modules/document-expiry/public-api';
import { cleanupHelperUsers, loginAsStaff, type TestPrincipal } from './helpers/login';

// NOTIF-05 (ADR-004): the domain-event bus. Publishing a DocumentExpiring fact
// on the bus reaches the Notifications consumer (its @OnEvent handler), which
// renders the content and raises one notification per recipient — with the
// producer never referencing Notifications. publish() awaits handlers, so the
// effect is observable synchronously here. (That document-expiry no longer
// imports NotificationsModule is enforced structurally by the module-boundary
// lint + build.)

const MARK = 'NOTIF-05-test';

describe('DocumentExpiring event → Notifications (NOTIF-05, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let bus: EventBus;
  let alice: TestPrincipal;
  let bob: TestPrincipal;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    bus = app.get(EventBus);
    alice = await loginAsStaff(app, 'hr_officer');
    bob = await loginAsStaff(app, 'gro_officer');
  });

  afterAll(async () => {
    await owner.notification.deleteMany({
      where: { recipientUserId: { in: [alice.userId, bob.userId] } },
    });
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('fans out a notification to each recipient with rendered content', async () => {
    const documentId = randomUUID();
    await bus.publish(
      new DocumentExpiringEvent(
        documentId,
        randomUUID(), // clientId
        'iqama',
        `${MARK} passport of Ahmed`,
        '2026-08-20',
        30,
        25, // days until → "expiring soon"
        [alice.userId, bob.userId],
        'corr-1',
      ),
    );

    for (const user of [alice, bob]) {
      const rows = await owner.notification.findMany({
        where: { recipientUserId: user.userId, data: { path: ['documentId'], equals: documentId } },
      });
      expect(rows.length).toBe(1);
      expect(rows[0]?.category).toBe('document_expiry');
      expect(rows[0]?.titleEn).toBe('Iqama expiring soon'); // consumer-rendered content
      expect(rows[0]?.data).toMatchObject({ threshold: 30, documentId });
    }
  });

  it('renders the expired variant for tier 0', async () => {
    const documentId = randomUUID();
    await bus.publish(
      new DocumentExpiringEvent(
        documentId,
        randomUUID(),
        'contract',
        `${MARK} contract`,
        '2026-07-01',
        0,
        -5, // already expired
        [alice.userId],
        null,
      ),
    );

    const rows = await owner.notification.findMany({
      where: { recipientUserId: alice.userId, data: { path: ['documentId'], equals: documentId } },
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.titleEn).toBe('Contract has expired');
  });

  it('an event with no recipients is a no-op', async () => {
    const before = await owner.notification.count({
      where: { recipientUserId: { in: [alice.userId, bob.userId] } },
    });
    await bus.publish(
      new DocumentExpiringEvent(randomUUID(), randomUUID(), 'visa', `${MARK} x`, '2026-09-01', 7, 3, [], null),
    );
    const after = await owner.notification.count({
      where: { recipientUserId: { in: [alice.userId, bob.userId] } },
    });
    expect(after).toBe(before);
  });
});
