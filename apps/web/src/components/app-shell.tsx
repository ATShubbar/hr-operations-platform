'use client';

import { useEffect, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AppNav, NavFoot } from '@/components/app-nav';
import { BrandMark } from '@/components/brand-mark';
import { HeaderLocation, HeaderLocationProvider } from '@/components/header-location';
import { LanguageSwitcher } from '@/components/language-switcher';
import { MobileNav } from '@/components/mobile-nav';
import { NavCountsProvider } from '@/components/nav-counts';
import { NotificationBell } from '@/components/notification-bell';
import { GlobalSearch } from './global-search';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useSession } from '@/lib/session';

// Authenticated app shell (AUDIT-05, made role-aware in AUTH-08). The link list
// itself moved to AppNav in UX-05 so the sidebar and the mobile sheet render the
// same thing — see that file for why. DS-02 took the People & Gro console's
// geometry: a 248px sidebar with a 56px brand row and a pinned identity foot,
// and a 56px header that carries LOCATION (HeaderLocation) rather than account
// controls — sign-out moved down to the identity it ends.
export function AppShell({ children }: { children: ReactNode }) {
  const me = useSession();
  const pathname = usePathname();
  const router = useRouter();

  // An employee's whole surface is their own file (SS-07). Anywhere else — the
  // root URL redirects to /overview, a stale bookmark, a typed staff URL — goes to
  // /me. The page is NOT rendered meanwhile: a child's effects run before this
  // one, so rendering /overview first would fire its staff requests (403s) before
  // the redirect landed.
  const misplacedEmployee =
    me.principalType === 'employee' && pathname !== '/me' && !pathname.startsWith('/me/');
  useEffect(() => {
    if (misplacedEmployee) router.replace('/me');
  }, [misplacedEmployee, router]);

  return (
    <NavCountsProvider>
      <HeaderLocationProvider>
        <ShellFrame>{misplacedEmployee ? null : children}</ShellFrame>
      </HeaderLocationProvider>
    </NavCountsProvider>
  );
}

function ShellFrame({ children }: { children: ReactNode }) {
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

      {/* 248px (DS-02, the design's width; UX-17 had widened to 260 for its
          identity block, which now lives in the foot).

          `sticky top-0 h-dvh`: without a viewport-height box the pinned foot's
          "bottom" is the bottom of the PAGE — measured in UX-17, the footer sat
          2243px down a long screen. The nav owns its own scroll instead. */}
      <aside className="hidden w-[248px] shrink-0 border-e bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:flex md:h-dvh md:flex-col">
        <div className="flex h-14 shrink-0 flex-col items-start justify-center gap-1 border-b px-4">
          {/* The mark keeps its artwork colours on the navy chip (UX-15) — the
              design's monochrome tile is a placeholder for a logo we have. */}
          <BrandMark width={104} className="px-2 py-1.5" />
          <span className="text-[11px] leading-[13px] text-muted-foreground">
            {t('nav.consoleSubtitle')}
          </span>
        </div>
        <AppNav className="min-h-0 overflow-y-auto" />
        <NavFoot />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 md:gap-3 md:px-6">
          {/* The mobile entry point into the nav (UX-05); the sidebar takes over
              at md, so both the trigger and the sheet are md:hidden. */}
          <MobileNav />
          <HeaderLocation />
          <div className="ms-auto flex shrink-0 items-center gap-1 md:gap-3">
            {/* The prototype's global search (264×28), placed where it sits —
                live since SEARCH-01 (ADR-015). On phones, a search icon. */}
            <GlobalSearch />
            <NotificationBell />
            <LanguageSwitcher className="inline-flex h-8 items-center rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" />
          </div>
        </header>
        {/* tabIndex={-1} is what makes the skip link actually SKIP: a hash link
            to a non-focusable element scrolls and leaves focus where it was, so
            the next Tab returns to the nav — the failure mode that makes half
            the skip links on the web decorative. */}
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 py-6 outline-none md:px-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
