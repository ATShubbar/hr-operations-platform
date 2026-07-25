import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

// The product's front door (UX-04).
//
// This route used to render the WS-01 walking-skeleton demo — a hardcoded sample
// company, today's Hijri date, and a link to a component-check page — with no link
// to login and no way into the app. It was the first thing anyone saw at the root
// URL for the entire build.
//
// Now it sends people to "Today". The (app) layout guard bounces unauthenticated
// visitors to /login, so this needs no session check of its own: one destination,
// and the guard that already exists decides whether they reach it.
export default async function RootPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (hasLocale(['ar', 'en'], locale)) setRequestLocale(locale);
  redirect({ href: '/today', locale });
}
