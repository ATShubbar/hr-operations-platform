'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api';

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations('common');
  const other = locale === 'ar' ? 'en' : 'ar';

  // Wire the language switch to the user's ui.language preference (CONF-05):
  // persist the choice so it survives sessions and drives the post-login
  // landing. Fire-and-forget — on the unauthenticated login page this 401s and
  // is ignored; the Link still switches the visible locale.
  const persist = () => {
    void apiFetch('/config/me/ui.language', {
      method: 'PATCH',
      body: JSON.stringify({ value: other }),
    }).catch(() => {});
  };

  return (
    <Link
      href={pathname}
      locale={other}
      onClick={persist}
      className="text-sm underline underline-offset-4"
    >
      {t('switchLanguage')}
    </Link>
  );
}
