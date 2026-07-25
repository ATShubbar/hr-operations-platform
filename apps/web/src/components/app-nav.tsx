'use client';

import type { ElementType } from 'react';
import { useTranslations } from 'next-intl';
import {
  Activity,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  FileText,
  Landmark,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  Settings,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { useCan, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

// The navigation, rendered by BOTH the desktop sidebar and the mobile sheet
// (UX-05) — a second copy drifts the first time a gate changes, and drifts
// invisibly on whichever surface nobody is looking at.
//
// UX-17 replaced a flat list of sixteen links with grouped, icon-led sections
// and an identity block. **The grouping is EDITORIAL**: the routes are flat and
// imply no hierarchy, so these headings are a judgement about how the work
// divides, and they have to be maintained by hand. A new screen that lands in
// no group is a decision to make, not a default to inherit.
//
// Client reps get a single ungrouped section — their surface is four screens,
// and a heading over one group is chrome.
//
// Rendered inside SessionProvider (the route guard), so useCan and useSession
// are always resolved here.

type Item = { href: string; label: string; icon: ElementType };
type Group = { heading?: string; items: Item[] };

const SIDEBAR_ROW = 'gap-2.5 rounded-md px-2.5 py-[7px] text-[13px]';

// 44px in the sheet (WCAG 2.5.5) — thumbs on a phone, not a mouse pointer.
const SHEET_ROW = 'min-h-11 gap-3 rounded-md px-2.5 py-2 text-sm';

export function AppNav({
  variant = 'sidebar',
  className,
}: {
  variant?: 'sidebar' | 'sheet';
  className?: string;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const me = useSession();

  // Hooks must run unconditionally, so every capability is read up front and the
  // groups are assembled from the results.
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
  const canStaffUsers = useCan('staff-user.read');
  const canSettings = useCan('config.read-self');
  const canPortal = useCan('portal.read');
  const canPortalUsers = useCan('client-user.read');

  const groups: Group[] = canPortal
    ? [
        {
          items: [
            { href: '/portal/company', label: t('nav.portalCompany'), icon: Building2 },
            { href: '/portal/employees', label: t('nav.portalEmployees'), icon: UsersRound },
            { href: '/portal/documents', label: t('nav.portalDocuments'), icon: FileText },
            // Client ADMIN only — the matrix gives client-user.* to that role alone.
            ...(canPortalUsers
              ? [{ href: '/portal/users', label: t('nav.portalUsers'), icon: UserRound }]
              : []),
          ],
        },
      ]
    : [
        // Today is the front door for staff (UX-04) and sits ABOVE the groups
        // rather than inside one — it is the whole queue, not a category of it.
        { items: [{ href: '/today', label: t('nav.today'), icon: LayoutDashboard }] },
        {
          heading: t('nav.groupClients'),
          items: [
            ...(canClients ? [{ href: '/clients', label: t('nav.clients'), icon: Building2 }] : []),
            ...(canEmployees
              ? [{ href: '/employees', label: t('nav.employees'), icon: UsersRound }]
              : []),
            ...(canDocuments
              ? [{ href: '/documents', label: t('nav.documents'), icon: FileText }]
              : []),
            ...(canDocuments ? [{ href: '/expiry', label: t('nav.expiry'), icon: Activity }] : []),
          ],
        },
        {
          heading: t('nav.groupOperations'),
          items: [
            ...(canRequests
              ? [{ href: '/requests', label: t('nav.requests'), icon: ClipboardList }]
              : []),
            ...(canTasks ? [{ href: '/tasks', label: t('nav.tasks'), icon: ListChecks }] : []),
            ...(canGro ? [{ href: '/gro', label: t('nav.gro'), icon: Landmark }] : []),
            ...(canCalendar
              ? [{ href: '/calendar', label: t('nav.calendar'), icon: CalendarDays }]
              : []),
            ...(canIntegrations
              ? [{ href: '/integrations', label: t('nav.integrations'), icon: CalendarCheck }]
              : []),
          ],
        },
        {
          heading: t('nav.groupRecruitment'),
          items: [
            ...(canVacancies
              ? [{ href: '/vacancies', label: t('nav.vacancies'), icon: Briefcase }]
              : []),
            ...(canCandidates
              ? [{ href: '/candidates', label: t('nav.candidates'), icon: UserRound }]
              : []),
          ],
        },
        // A role can hold none of a group's capabilities — a Recruiter has no
        // GRO, Finance has no recruitment — so an empty group must not leave a
        // heading standing over nothing.
      ].filter((g) => g.items.length > 0);

  // Administration sits at the foot behind a rule: reached occasionally, and not
  // part of the daily work the groups above describe.
  const footer: Item[] = [
    ...(canReports ? [{ href: '/reports', label: t('nav.reports'), icon: Activity }] : []),
    ...(canStaffUsers
      ? [{ href: '/staff-users', label: t('nav.staffUsers'), icon: UsersRound }]
      : []),
    ...(canAudit ? [{ href: '/audit', label: t('nav.auditLog'), icon: ScrollText }] : []),
    ...(canSettings ? [{ href: '/settings', label: t('nav.settings'), icon: Settings }] : []),
  ];

  // A nav entry is current when you are on its screen OR inside it — the
  // separator stops `/portal/company` matching a future `/portal/companies`.
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const row = (item: Item) => {
    const current = isCurrent(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={current ? 'page' : undefined}
        className={cn(
          'flex items-center transition-colors',
          variant === 'sheet' ? SHEET_ROW : SIDEBAR_ROW,
          // Colour is not the only signal: the weight change carries the state
          // on its own, so it survives a greyscale render (1.4.1).
          current
            ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
            : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
        )}
      >
        <item.icon
          aria-hidden
          strokeWidth={1.5}
          className={cn('size-4 shrink-0', !current && 'text-muted-foreground/70')}
        />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  };

  return (
    <nav
      className={cn('flex flex-1 flex-col gap-4 px-2 py-2', className)}
      aria-label={t('nav.console')}
    >
      {/* Who is signed in, from /auth/me — a name and a role we have had since
          UX-10b. It fills the slot the source component gave a workspace
          switcher, which has no meaning here: staff work across every client at
          once, so there is nothing to switch between and a picker would
          misdescribe how the product scopes data. */}
      <div className="flex items-center gap-2.5 px-1.5 pt-1">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-[13px] font-semibold text-primary-foreground"
        >
          {(me.displayName ?? '·').charAt(0)}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] leading-none font-medium">
            {me.displayName ?? t('nav.console')}
          </span>
          <span className="mt-1 truncate text-[11px] leading-none text-muted-foreground">
            {t(`roles.${me.role}`)}
          </span>
        </span>
      </div>

      {groups.map((group, i) => (
        <div key={group.heading ?? i} className="flex flex-col gap-0.5">
          {group.heading && (
            <span className="mb-1 px-2.5 text-[11px] font-semibold tracking-wider text-muted-foreground/60 uppercase">
              {group.heading}
            </span>
          )}
          {group.items.map(row)}
        </div>
      ))}

      {footer.length > 0 && (
        <div className="mt-auto flex flex-col gap-0.5 border-t pt-3">{footer.map(row)}</div>
      )}
    </nav>
  );
}
