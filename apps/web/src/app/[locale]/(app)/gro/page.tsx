import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

// The GRO processes screen (GRO-04) was retired in DS-22b (owner decision): open
// procedures are in the Work queue (DS-12), finished ones in its Finished view.
// Kept as a redirect, preset to finished procedures.
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (hasLocale(['ar', 'en'], locale)) setRequestLocale(locale);
  redirect({ href: '/queue?view=finished&kind=procedure', locale });
}
