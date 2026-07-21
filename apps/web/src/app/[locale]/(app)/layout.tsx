import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/language-switcher';
import { SignOutButton } from '@/components/sign-out-button';

// Authenticated app shell (AUDIT-05): sidebar navigation + header. Direction
// comes from the root <html dir> (ADR-005); all spacing uses logical
// utilities so it mirrors correctly in Arabic. Route protection is per-page
// (a 401 from the API bounces to /login) until a session endpoint exists.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations();

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 border-e bg-sidebar text-sidebar-foreground md:flex md:flex-col">
        <div className="flex h-14 items-center px-4 text-sm font-semibold">{t('common.appName')}</div>
        <nav className="flex flex-col gap-1 px-2 py-2">
          <Link
            href="/clients"
            className="flex items-center rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {t('nav.clients')}
          </Link>
          <Link
            href="/audit"
            className="flex items-center rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {t('nav.auditLog')}
          </Link>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-4 border-b px-4">
          <span className="text-sm font-medium md:hidden">{t('nav.console')}</span>
          <div className="ms-auto flex items-center gap-2">
            <LanguageSwitcher />
            <SignOutButton />
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
