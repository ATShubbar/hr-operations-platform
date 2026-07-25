'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AppNav } from '@/components/app-nav';
import { BrandMark } from '@/components/brand-mark';
import { LanguageSwitcher } from '@/components/language-switcher';
import { MobileNav } from '@/components/mobile-nav';
import { NotificationBell } from '@/components/notification-bell';
import { SignOutButton } from '@/components/sign-out-button';

// Authenticated app shell (AUDIT-05, made role-aware in AUTH-08). The link list
// itself moved to AppNav in UX-05 so the sidebar and the mobile sheet render the
// same thing — see that file for why.
export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations();

  return (
    <div className="flex min-h-dvh">
      {/* Bypass block (WCAG 2.4.1, UX-11). Up to sixteen nav links precede the
          content on every screen, so without this a keyboard user re-tabs the
          whole sidebar after every navigation.

          Parked off-screen with a transform rather than `sr-only` +
          `focus:not-sr-only`. `not-sr-only` sets `padding: 0`, and under a
          `:focus` variant that outranks the plain `px-4 py-2` — measured, the
          revealed link came back 91×20 with no padding at all. */}
      <a
        href="#main-content"
        className="fixed top-3 start-3 z-50 -translate-y-20 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md focus:translate-y-0 motion-safe:transition-transform"
      >
        {t('nav.skipToContent')}
      </a>

      <aside className="hidden w-60 shrink-0 border-e bg-sidebar text-sidebar-foreground md:flex md:flex-col">
        <div className="flex h-14 items-center px-4">
          <BrandMark width={132} />
        </div>
        <AppNav />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b px-4 md:gap-4">
          {/* The mobile entry point into the nav (UX-05); the sidebar takes over
              at md, so both the trigger and the sheet are md:hidden. */}
          <MobileNav />
          <span className="truncate text-sm font-medium md:hidden">{t('nav.console')}</span>
          <div className="ms-auto flex shrink-0 items-center gap-1 md:gap-2">
            <NotificationBell />
            <LanguageSwitcher />
            <SignOutButton />
          </div>
        </header>
        {/* tabIndex={-1} is what makes the skip link actually SKIP: a hash link
            to a non-focusable element scrolls and leaves focus where it was, so
            the next Tab returns to the nav — the failure mode that makes half
            the skip links on the web decorative. */}
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 outline-none md:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
