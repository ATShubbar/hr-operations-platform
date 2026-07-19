import { getTranslations, setRequestLocale } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { clientCompanySchema, type ClientCompany } from '@hr/contracts';
import { formatHijri } from '@hr/dates';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/language-switcher';

const sample: ClientCompany = clientCompanySchema.parse({
  id: 'f6a7c8d0-1234-4b5c-9d0e-abcdef012345',
  name: { ar: 'شركة المثال', en: 'Example Company' },
  status: 'active',
});

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (hasLocale(['ar', 'en'], locale)) setRequestLocale(locale);
  const t = await getTranslations('home');
  const tc = await getTranslations('common');

  return (
    <main className="mx-auto max-w-2xl ps-6 pe-6 pt-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium">{tc('appName')}</h1>
        <LanguageSwitcher />
      </div>
      <p className="mt-2 text-gray-600">{t('subtitle')}</p>
      <p className="mt-1 text-sm text-gray-500">
        {t('todayHijri')}: {formatHijri(new Date(), locale === 'ar' ? 'ar' : 'en')}
      </p>
      <section className="mt-8 rounded-lg border border-gray-200 p-4">
        <h2 className="text-sm font-medium text-gray-500">{t('contractCheck')}</h2>
        <dl className="mt-3 space-y-1">
          <div className="flex gap-2">
            <dt className="font-medium">{t('clientLabel')}:</dt>
            <dd>{locale === 'ar' ? sample.name.ar : sample.name.en}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium">{t('statusLabel')}:</dt>
            <dd>{t('statusActive')}</dd>
          </div>
        </dl>
      </section>
      <p className="mt-6">
        <Link href="/rtl-check" className="text-sm underline underline-offset-4">
          {t('rtlCheckLink')}
        </Link>
      </p>
    </main>
  );
}
