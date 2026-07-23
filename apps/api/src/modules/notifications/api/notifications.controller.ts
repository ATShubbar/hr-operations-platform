import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import {
  notificationCategorySchema,
  setNotificationPreferenceRequestSchema,
  type NotificationListResponse,
  type NotificationPreferencesResponse,
  type NotificationResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { requestContext } from '../../../context/request-context';
import type { NotificationModel as NotificationRecord } from '../../../generated/prisma/models';
import { NotificationsService } from '../application/notifications.service';
import { NotificationPreferencesService } from '../application/notification-preferences.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Notifications read/mark-read API (NOTIF-02) — self-service: every endpoint
// operates on the CALLER's own notifications, keyed by the actor from the
// session (never the URL). Any authenticated principal holds `notification.read`.
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly preferences: NotificationPreferencesService,
  ) {}

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

  // The caller's effective per-category EMAIL preferences (NOTIF-04). In-app
  // delivery is always on and not represented here.
  @RequirePermission('notification.read')
  @Get('preferences')
  async getPreferences(): Promise<NotificationPreferencesResponse> {
    return { email: await this.preferences.effectiveFor(this.actorId()) };
  }

  // Toggle EMAIL for one category (per-category PATCH); own preferences only —
  // the actor is the session's, never the URL. Returns the full effective map.
  @RequirePermission('notification-pref.update')
  @Patch('preferences/:category')
  async setPreference(
    @Param('category') category: string,
    @Body() body: unknown,
  ): Promise<NotificationPreferencesResponse> {
    const cat = notificationCategorySchema.safeParse(category);
    if (!cat.success) throw new NotFoundException('Unknown category');
    const parsed = setNotificationPreferenceRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid preference payload');
    await this.preferences.setEmailEnabled(this.actorId(), cat.data, parsed.data.emailEnabled);
    return { email: await this.preferences.effectiveFor(this.actorId()) };
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
