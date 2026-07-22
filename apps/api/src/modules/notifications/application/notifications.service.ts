import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import type { NotificationModel as NotificationRecord } from '../../../generated/prisma/models';
import { DISPATCH_QUEUE } from '../../queue/public-api';
import type { NotifyInput } from '../domain/notification';

// Notifications access (NOTIF-02). notify() is the producer entry point other
// modules call (the document-expiry engine, 3.4, is the first). The in-app
// record is the source of truth; a dispatch job is enqueued for async delivery
// (email lands in NOTIF-03). Reads/writes are the caller's OWN only — every
// method is keyed by a userId the controller takes from the request context,
// never from input (application-enforced isolation; the table has no RLS).
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(DISPATCH_QUEUE) private readonly dispatch: Queue,
  ) {}

  async notify(input: NotifyInput): Promise<NotificationRecord> {
    const row = await this.prisma.notification.create({
      data: {
        recipientUserId: input.recipientUserId,
        category: input.category,
        titleAr: input.title.ar,
        titleEn: input.title.en,
        bodyAr: input.body.ar,
        bodyEn: input.body.en,
        data: input.data,
      },
    });
    // Best-effort async delivery — the in-app row is already committed and is the
    // source of truth; the worker (NOTIF-03) renders + sends the email.
    await this.dispatch.add('notification', { notificationId: row.id });
    return row;
  }

  listForActor(
    userId: string,
    opts?: { unreadOnly?: boolean; limit?: number },
  ): Promise<NotificationRecord[]> {
    return this.prisma.notification.findMany({
      where: { recipientUserId: userId, ...(opts?.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: opts?.limit ?? 50,
    });
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { recipientUserId: userId, readAt: null } });
  }

  // Mark one of the caller's OWN notifications read. Returns null if it isn't
  // theirs (or doesn't exist) → the controller 404s, leaking no existence.
  async markRead(userId: string, id: string): Promise<NotificationRecord | null> {
    const row = await this.prisma.notification.findUnique({ where: { id } });
    if (!row || row.recipientUserId !== userId) return null;
    if (row.readAt) return row;
    return this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  async markAllRead(userId: string): Promise<number> {
    const res = await this.prisma.notification.updateMany({
      where: { recipientUserId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    return res.count;
  }
}
