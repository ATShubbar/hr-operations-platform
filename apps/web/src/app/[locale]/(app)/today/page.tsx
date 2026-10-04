import { setRequestLocale } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { redirect } from '@/i18n/navigation';

// "Today" (UX-04) was the home screen until the Overview replaced it (DS-17); its
// work list lives on as the Work queue. Old bookmarks land on the Overview.
export default async function TodayPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (hasLocale(['ar', 'en'], locale)) setRequestLocale(locale);
  redirect({ href: '/overview', locale });
}
