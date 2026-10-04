import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

// REC-06's candidates screen became part of Hiring (DS-09). Kept as a redirect so
// bookmarks and old links still land somewhere useful.
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (hasLocale(['ar', 'en'], locale)) setRequestLocale(locale);
  redirect({ href: '/hiring', locale });
}
