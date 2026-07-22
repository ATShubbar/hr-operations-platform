import {
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import type { NotificationListResponse, NotificationResponse } from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { requestContext } from '../../../context/request-context';
import type { NotificationModel as NotificationRecord } from '../../../generated/prisma/models';
import { NotificationsService } from '../application/notifications.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Notifications read/mark-read API (NOTIF-02) — self-service: every endpoint
// operates on the CALLER's own notifications, keyed by the actor from the
// session (never the URL). Any authenticated principal holds `notification.read`.
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @RequirePermission('notification.read')
  @Get()
  async list(@Query('unread') unread?: string): Promise<NotificationListResponse> {
    const userId = this.actorId();
    const [rows, unreadCount] = await Promise.all([
      this.notifications.listForActor(userId, { unreadOnly: unread === 'true' }),
      this.notifications.unreadCount(userId),
    ]);
    return { notifications: rows.map(toResponse), unreadCount };
  }

  @RequirePermission('notification.read')
  @Post(':id/read')
  @HttpCode(200)
  async markRead(@Param('id') id: string): Promise<NotificationResponse> {
    if (!UUID_RE.test(id)) throw new NotFoundException('Notification not found');
    const row = await this.notifications.markRead(this.actorId(), id);
    if (!row) throw new NotFoundException('Notification not found');
    return toResponse(row);
  }

  @RequirePermission('notification.read')
  @Post('read-all')
  @HttpCode(200)
  async markAllRead(): Promise<{ updated: number }> {
    return { updated: await this.notifications.markAllRead(this.actorId()) };
  }

  private actorId(): string {
    const id = requestContext.get()?.actorId;
    if (!id) throw new UnauthorizedException('No authenticated actor');
    return id;
  }
}

function toResponse(n: NotificationRecord): NotificationResponse {
  return {
    id: n.id,
    category: n.category,
    title: { ar: n.titleAr, en: n.titleEn },
    body: { ar: n.bodyAr, en: n.bodyEn },
    data: n.data ?? null,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  };
}
