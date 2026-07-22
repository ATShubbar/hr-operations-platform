import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UsersService } from '../../auth/public-api';
import { ConfigService } from '../../configuration/public-api';
import { EMAIL_TRANSPORT, type EmailTransport } from '../domain/email';
import { renderNotificationEmail } from './notification-templates';

// Notification delivery (NOTIF-03) — what the dispatch worker runs per job. Loads
// the notification (own table), resolves the recipient's email (auth's
// UsersService) and language (config), renders the ar/en email, and hands it to
// the transport. Best-effort: a missing notification/email is a no-op (the in-app
// record remains the source of truth).
@Injectable()
export class NotificationDispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
    @Inject(EMAIL_TRANSPORT) private readonly email: EmailTransport,
  ) {}

  async dispatch(notificationId: string): Promise<void> {
    const notif = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notif) return; // notification gone — nothing to send
    const user = await this.users.findById(notif.recipientUserId);
    if (!user?.email) return; // no recipient address
    const lang = await this.config.resolveLanguageForUser(notif.recipientUserId);
    const { subject, text } = renderNotificationEmail(notif, lang);
    await this.email.send({ to: user.email, subject, text });
  }
}
