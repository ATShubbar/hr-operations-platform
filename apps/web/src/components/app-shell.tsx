'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/language-switcher';
import { NotificationBell } from '@/components/notification-bell';
import { SignOutButton } from '@/components/sign-out-button';
import { useCan } from '@/lib/session';

const NAV_LINK =
  'flex items-center rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';

// Authenticated app shell (AUDIT-05, made role-aware in AUTH-08). Nav links
// appear only for capabilities the actor holds. Rendered inside SessionProvider
// (the route guard), so useCan is always resolved here.
export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const canClients = useCan('client.read');
  const canEmployees = useCan('employee.read');
  const canDocuments = useCan('document.read');
  const canRequests = useCan('request.read');
  const canAudit = useCan('audit.read');
  const canSettings = useCan('config.read-self'); // every authenticated principal

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 border-e bg-sidebar text-sidebar-foreground md:flex md:flex-col">
        <div className="flex h-14 items-center px-4 text-sm font-semibold">
          {t('common.appName')}
        </div>
        <nav className="flex flex-col gap-1 px-2 py-2">
          {canClients && (
            <Link href="/clients" className={NAV_LINK}>
              {t('nav.clients')}
            </Link>
          )}
          {canEmployees && (
            <Link href="/employees" className={NAV_LINK}>
              {t('nav.employees')}
            </Link>
          )}
          {canDocuments && (
            <Link href="/documents" className={NAV_LINK}>
              {t('nav.documents')}
            </Link>
          )}
          {canDocuments && (
            <Link href="/expiry" className={NAV_LINK}>
              {t('nav.expiry')}
            </Link>
          )}
          {canRequests && (
            <Link href="/requests" className={NAV_LINK}>
              {t('nav.requests')}
            </Link>
          )}
          {canAudit && (
            <Link href="/audit" className={NAV_LINK}>
              {t('nav.auditLog')}
            </Link>
          )}
          {canSettings && (
            <Link href="/settings" className={NAV_LINK}>
              {t('nav.settings')}
            </Link>
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-4 border-b px-4">
          <span className="text-sm font-medium md:hidden">{t('nav.console')}</span>
          <div className="ms-auto flex items-center gap-2">
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
