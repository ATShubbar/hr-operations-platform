import type { NotificationCategory } from '@hr/contracts';
import type { Prisma } from '../../../generated/prisma/client';

// The input producers pass to NotificationsService.notify(). Content is supplied
// bilingual (ar/en); `data` is an optional structured link (e.g. { documentId }).
export interface NotifyInput {
  recipientUserId: string;
  category: NotificationCategory;
  title: { ar: string; en: string };
  body: { ar: string; en: string };
  data?: Prisma.InputJsonValue;
}
