import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

// The expiry dashboard (EXP-03) was retired in DS-22a (owner decision): what is
// expiring is the Overview's runway (DS-17, each cell opening that group on
// People), and "Run scan now" moved to Settings → System. Kept as a redirect.
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (hasLocale(['ar', 'en'], locale)) setRequestLocale(locale);
  redirect({ href: '/overview', locale });
}
