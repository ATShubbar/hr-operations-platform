import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { IBM_Plex_Sans_Arabic, Inter } from 'next/font/google';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AppProviders } from '@/components/app-providers';
import { directionFor, routing } from '@/i18n/routing';
import '../globals.css';

// Preset font (shadcn preset b6HGgLcLQ → Inter), Latin only.
//
// `adjustFontFallback: false` is load-bearing, and the reason is not obvious.
// next/font normally emits TWO families per font: "Inter" and a generated
// "Inter Fallback" — a local face (Arial here) with size-adjust applied to match
// Inter's metrics. Both land in the variable, so `var(--font-latin)` expands to
// `Inter, "Inter Fallback"`. That generated fallback is a REAL system font, and
// it covers Arabic — so it intercepted every Arabic glyph before the stack ever
// reached IBM Plex Sans Arabic. Measured: the Arabic string rendered at 482.41px
// against 500.95px for Plex and 479.77px for the OS sans — matching neither,
// because it was drawing in the metric-adjusted Arial.
//
// The same trap catches an explicit `fallback` list: any generic family
// (ui-sans-serif, system-ui) resolves to a face that also covers Arabic, so it
// would intercept in turn. Inter therefore contributes ONLY itself, and the
// generic fallbacks live once, at the end of the composed stack in globals.css —
// after the Arabic face, where they belong.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-latin',
  display: 'swap',
  adjustFontFallback: false,
});

// The Arabic face (UX-08).
//
// Until now the app loaded Inter and nothing else — and Inter has NO ARABIC
// GLYPHS, so every Arabic character on the product's DEFAULT locale was drawn by
// whatever each machine happened to fall back to (Geeza Pro on macOS, Tahoma on
// Windows, Noto Naskh on Android). Measured before changing it: the same string
// rendered at 156.49px in "Inter", 156.32px in sans-serif and 154.99px in serif —
// three different families producing one width, because all three resolved to the
// same fallback.
//
// IBM Plex Sans Arabic is chosen to sit next to Inter: both are neo-grotesques
// with an open aperture and a similar vertical proportion, so mixed Arabic/Latin
// runs — which this product is full of (client names, reference codes, iqama
// numbers) — do not read as two typefaces fighting.
//
// Three weights, matching what the UI actually asks for: `font-medium` (500)
// appears 39 times and `font-semibold` (600) 40 times. Loading only 400/600
// would leave every Arabic "medium" to resolve down to 400 while its Latin
// neighbour sat at 500 — a mismatch inside the same line of text. Nothing uses
// `font-bold`, so 700 is not loaded.
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600'],
  variable: '--font-arabic',
  display: 'swap',
});

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
    <html
      lang={locale}
      dir={directionFor(locale)}
      className={`${inter.variable} ${plexArabic.variable}`}
    >
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
