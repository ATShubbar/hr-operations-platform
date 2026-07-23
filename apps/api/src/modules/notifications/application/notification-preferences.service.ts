import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/public-api';
import type { NotificationCategory } from '../../../generated/prisma/client';

// Every category, in one place — the default (email ON) map is built from this.
const CATEGORIES: readonly NotificationCategory[] = [
  'document_expiry',
  'task',
  'request',
  'general',
  'system',
];

// Per-user notification preferences (NOTIF-04). User-OWNED (notif_preferences,
// no RLS): every method is keyed by a userId the caller takes from the request
// context, never from input. Opt-out model — absence of a row means email is
// enabled, so a brand-new user gets mail for everything until they turn a
// category off. The in-app notification is written regardless; this only ever
// suppresses the EMAIL side of dispatch.
@Injectable()
export class NotificationPreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Effective per-category email flags: default ON, overlaid with stored overrides.
  async effectiveFor(userId: string): Promise<Record<NotificationCategory, boolean>> {
    const rows = await this.prisma.notificationPreference.findMany({ where: { userId } });
    const map = Object.fromEntries(CATEGORIES.map((c) => [c, true])) as Record<
      NotificationCategory,
      boolean
    >;
    for (const r of rows) map[r.category] = r.emailEnabled;
    return map;
  }

  // The dispatch gate: is email enabled for this user + category? Default true.
  async isEmailEnabled(userId: string, category: NotificationCategory): Promise<boolean> {
    const row = await this.prisma.notificationPreference.findUnique({
      where: { userId_category: { userId, category } },
    });
    return row ? row.emailEnabled : true;
  }

  // Upsert one category's email flag for the caller; audited (actor-attributed,
  // like CONF-03 user-settings writes).
  async setEmailEnabled(
    userId: string,
    category: NotificationCategory,
    emailEnabled: boolean,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.notificationPreference.findUnique({
        where: { userId_category: { userId, category } },
      });
      const row = await tx.notificationPreference.upsert({
        where: { userId_category: { userId, category } },
        create: { userId, category, emailEnabled },
        update: { emailEnabled },
      });
      await this.audit.record(tx, {
        resource: 'notification-pref',
        action: 'update',
        before: before ? { userId, category, emailEnabled: before.emailEnabled } : undefined,
        after: { userId, category, emailEnabled: row.emailEnabled },
      });
    });
  }
}
