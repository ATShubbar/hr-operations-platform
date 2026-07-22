import type { NotificationModel as NotificationRecord } from '../../../generated/prisma/models';

// Email rendering (NOTIF-03). The notification already stores its title/body
// bilingual (the producer filled both, NOTIF-02); the template picks the
// recipient's language and wraps it with ar/en email framing. Category-specific
// templating (structured data → title/body) happens producer-side.
export interface RenderedEmail {
  subject: string;
  text: string;
}

const FRAMING: Record<'ar' | 'en', { greeting: string; footer: string }> = {
  ar: { greeting: 'مرحباً،', footer: '—\nمنصة عمليات الموارد البشرية' },
  en: { greeting: 'Hello,', footer: '—\nHR Operations Platform' },
};

export function renderNotificationEmail(n: NotificationRecord, lang: 'ar' | 'en'): RenderedEmail {
  const subject = lang === 'ar' ? n.titleAr : n.titleEn;
  const body = lang === 'ar' ? n.bodyAr : n.bodyEn;
  const f = FRAMING[lang];
  return { subject, text: `${f.greeting}\n\n${body}\n\n${f.footer}` };
}
