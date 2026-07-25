'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useCan } from '@/lib/session';
import { cn } from '@/lib/utils';

// The navigation link list (UX-05), extracted from AppShell so the desktop
// sidebar and the mobile sheet render THE SAME THING.
//
// This is the whole reason the extraction happened: the alternative was a second
// copy of thirteen permission-gated links in the drawer's markup, which drifts
// the first time a gate changes or a screen is added — and the drift would be
// invisible on the surface whoever made the change wasn't looking at.
//
// Rendered inside SessionProvider (the route guard), so useCan is always
// resolved here.

const SIDEBAR_LINK =
  'flex items-center rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';

// The sheet gets a 44px target (WCAG 2.5.5) — these are thumbs on a phone, not a
// mouse pointer, and the sidebar's 36px row is a miss waiting to happen.
const SHEET_LINK =
  'flex min-h-11 items-center rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';

interface NavItem {
  href: string;
  label: string;
}

export function AppNav({
  variant = 'sidebar',
  className,
}: {
  variant?: 'sidebar' | 'sheet';
  className?: string;
}) {
  const t = useTranslations();

  // Hooks must run unconditionally, so every capability is read up front and the
  // list is assembled from the results.
  const canClients = useCan('client.read');
  const canEmployees = useCan('employee.read');
  const canDocuments = useCan('document.read');
  const canRequests = useCan('request.read');
  const canTasks = useCan('task.read');
  const canVacancies = useCan('vacancy.read');
  const canCandidates = useCan('candidate.read');
  const canGro = useCan('gro.read');
  const canCalendar = useCan('calendar.read');
  const canIntegrations = useCan('integration.google-calendar');
  const canReports = useCan('report.read');
  const canAudit = useCan('audit.read');
  const canSettings = useCan('config.read-self'); // every authenticated principal
  const canPortal = useCan('portal.read'); // client-only self-service surface (PORTAL-04)
  const canPortalUsers = useCan('client-user.read'); // Client Admin only (matrix)

  const items: NavItem[] = [
    // Today is the front door for staff (UX-04). Client reps have their own
    // portal landing, so it is hidden for them rather than showing a work queue
    // they have no work in.
    ...(!canPortal ? [{ href: '/today', label: t('nav.today') }] : []),
    // Client portal self-service nav (PORTAL-04) — client-only. Staff never hold
    // portal.read, so this whole group is hidden for the staff console.
    ...(canPortal
      ? [
          { href: '/portal/company', label: t('nav.portalCompany') },
          { href: '/portal/employees', label: t('nav.portalEmployees') },
          { href: '/portal/documents', label: t('nav.portalDocuments') },
        ]
      : []),
    // Client ADMIN only — the matrix gives client-user.* to that role alone, so a
    // standard portal user does not see this entry (UX-10a).
    ...(canPortalUsers ? [{ href: '/portal/users', label: t('nav.portalUsers') }] : []),
    ...(canClients ? [{ href: '/clients', label: t('nav.clients') }] : []),
    ...(canEmployees ? [{ href: '/employees', label: t('nav.employees') }] : []),
    ...(canDocuments ? [{ href: '/documents', label: t('nav.documents') }] : []),
    ...(canDocuments ? [{ href: '/expiry', label: t('nav.expiry') }] : []),
    ...(canRequests ? [{ href: '/requests', label: t('nav.requests') }] : []),
    ...(canTasks ? [{ href: '/tasks', label: t('nav.tasks') }] : []),
    ...(canVacancies ? [{ href: '/vacancies', label: t('nav.vacancies') }] : []),
    ...(canCandidates ? [{ href: '/candidates', label: t('nav.candidates') }] : []),
    ...(canGro ? [{ href: '/gro', label: t('nav.gro') }] : []),
    ...(canCalendar ? [{ href: '/calendar', label: t('nav.calendar') }] : []),
    ...(canIntegrations ? [{ href: '/integrations', label: t('nav.integrations') }] : []),
    ...(canReports ? [{ href: '/reports', label: t('nav.reports') }] : []),
    ...(canAudit ? [{ href: '/audit', label: t('nav.auditLog') }] : []),
    ...(canSettings ? [{ href: '/settings', label: t('nav.settings') }] : []),
  ];

  return (
    <nav
      className={cn('flex flex-col gap-1 px-2 py-2', className)}
      aria-label={t('nav.console')}
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={variant === 'sheet' ? SHEET_LINK : SIDEBAR_LINK}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
