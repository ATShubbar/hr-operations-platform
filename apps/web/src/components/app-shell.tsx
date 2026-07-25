'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AppNav } from '@/components/app-nav';
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
      <aside className="hidden w-60 shrink-0 border-e bg-sidebar text-sidebar-foreground md:flex md:flex-col">
        <div className="flex h-14 items-center px-4 text-sm font-semibold">
          {t('common.appName')}
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
        <main className="min-w-0 flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
