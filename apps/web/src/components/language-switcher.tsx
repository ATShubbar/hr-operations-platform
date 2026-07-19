'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations('common');
  const other = locale === 'ar' ? 'en' : 'ar';

  return (
    <Link href={pathname} locale={other} className="text-sm underline underline-offset-4">
      {t('switchLanguage')}
    </Link>
  );
}
