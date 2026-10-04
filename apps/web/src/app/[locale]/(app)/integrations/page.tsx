import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

// The Google Calendar invitations screen (GCAL-03) moved into Settings → System →
// Integrations in DS-22c (owner decision). Kept as a redirect, opening that tab.
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (hasLocale(['ar', 'en'], locale)) setRequestLocale(locale);
  redirect({ href: '/settings?tab=system', locale });
}
