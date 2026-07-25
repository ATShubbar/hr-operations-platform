import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AppProviders } from '@/components/app-providers';
import { directionFor, routing } from '@/i18n/routing';
import '../globals.css';

// Preset font (shadcn preset b6HGgLcLQ → Inter). next/font exposes it as the
// --font-sans CSS variable that globals.css's @theme maps to `font-sans`
// (heading maps to sans too). Latin subset; Arabic glyphs fall back to the
// system stack until a dedicated Arabic face is chosen (future refinement).
const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'common' });
  return { title: t('appName') };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} dir={directionFor(locale)} className={inter.variable}>
      <body>
        <NextIntlClientProvider>
          {/* dir on <html> styles the layout; DirectionProvider is what makes
              Base UI's BEHAVIOUR direction-aware (UX-02) — it does not read the
              DOM attribute, and its popups portal outside this tree. */}
          <AppProviders direction={directionFor(locale)}>{children}</AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
