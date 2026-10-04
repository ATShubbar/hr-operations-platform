import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

// The documents registry screen (DOC-05) was retired in DS-22a (owner decision):
// a person's documents live on their record (DS-07) and a company's own on its
// Client record's Records tab. Kept as a redirect so bookmarks land somewhere.
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (hasLocale(['ar', 'en'], locale)) setRequestLocale(locale);
  redirect({ href: '/clients', locale });
}
