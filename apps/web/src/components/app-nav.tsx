'use client';

import { useState, type ElementType } from 'react';
import { useTranslations } from 'next-intl';
import {
  Activity,
  Building2,
  CalendarCheck,
  CalendarDays,
  ChartColumn,
  ClipboardList,
  FileText,
  History,
  IdCard,
  Inbox,
  Landmark,
  LayoutGrid,
  LogOut,
  MessageSquare,
  Plane,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
  UsersRound,
} from 'lucide-react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api';
import { useCan, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { useNavCounts } from '@/components/nav-counts';
import { initialsOf } from '@/components/ui/avatar';

// The navigation, rendered by BOTH the desktop sidebar and the mobile sheet
// (UX-05) — a second copy drifts the first time a gate changes, and drifts
// invisibly on whichever surface nobody is looking at.
//
// UX-17 replaced a flat list of sixteen links with grouped, icon-led sections
// and an identity block; DS-02 restyled it to the People & Gro console (36px
// rows, counts) and moved identity + sign-out into a pinned foot (NavFoot,
// below). **The grouping is EDITORIAL**: the routes are flat and
// imply no hierarchy, so these headings are a judgement about how the work
// divides, and they have to be maintained by hand. A new screen that lands in
// no group is a decision to make, not a default to inherit.
//
// Client reps get a single ungrouped section — their surface is four screens,
// and a heading over one group is chrome.
//
// Rendered inside SessionProvider (the route guard), so useCan and useSession
// are always resolved here.

type Item = {
  href: string;
  label: string;
  icon: ElementType;
  /** Shown only when > 0 — a zero badge is noise on every quiet day. */
  count?: number;
  /** What the number means, for assistive tech (the digit alone is ambiguous). */
  countLabel?: string;
  /**
   * Current only on this exact path, not its children (SS-07): "My file" lives at
   * `/me` and "My requests" at `/me/requests`, so prefix matching would mark both.
   */
  exact?: boolean;
};
type Group = { heading?: string; items: Item[] };
type Variant = 'sidebar' | 'sheet';

// DS-02 geometry, from the People & Gro console: 36px rows, 8px radius, 16px
// icons, 14/20 text, 10px icon gap, 8px inline padding.
const SIDEBAR_ROW = 'h-9 gap-2.5 rounded-md px-2 text-sm';

// 44px in the sheet (WCAG 2.5.5) — thumbs on a phone, not a mouse pointer.
const SHEET_ROW = 'min-h-11 gap-3 rounded-md px-2.5 py-2 text-sm';

// A nav entry is current when you are on its screen OR inside it — the
// separator stops `/portal/company` matching a future `/portal/companies`.
function isCurrentPath(pathname: string, href: string, exact = false) {
  return pathname === href || (!exact && pathname.startsWith(`${href}/`));
}

function NavRow({ item, variant, pathname }: { item: Item; variant: Variant; pathname: string }) {
  const current = isCurrentPath(pathname, item.href, item.exact);
  const showCount = item.count !== undefined && item.count > 0;
  return (
    <Link
      href={item.href}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'flex shrink-0 items-center transition-colors',
        variant === 'sheet' ? SHEET_ROW : SIDEBAR_ROW,
        // The prototype's active row, exactly (ADR-012): a neutral-100 fill and
        // near-black text, NO weight change. DS-02 had kept a weight change as the
        // non-colour cue; the owner's later pixel-exact decision supersedes it.
        // `aria-current` still announces the state to assistive tech.
        current
          ? 'bg-neutral-100 text-neutral-900'
          : 'text-muted-foreground hover:bg-neutral-100/60 hover:text-foreground',
      )}
    >
      <item.icon aria-hidden strokeWidth={1.5} className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {showCount && (
        <>
          <span
            aria-hidden
            className={cn(
              'inline-flex h-[18px] min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 font-mono text-[11px] leading-none tabular-nums',
              // The prototype's count chip: inverted when its row is current.
              current ? 'bg-neutral-900 text-neutral-50' : 'bg-neutral-200 text-neutral-700',
            )}
          >
            {item.count}
          </span>
          <span className="sr-only">{item.countLabel}</span>
        </>
      )}
    </Link>
  );
}

export function AppNav({
  variant = 'sidebar',
  className,
}: {
  variant?: Variant;
  className?: string;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const counts = useNavCounts();

  // Hooks must run unconditionally, so every capability is read up front and the
  // groups are assembled from the results.
  const canClients = useCan('client.read');
  const canEmployees = useCan('employee.read');
  const canDocuments = useCan('document.read');
  const canRequests = useCan('request.read');
  const canTasks = useCan('task.read');
  const canVacancies = useCan('vacancy.read');
  const canGro = useCan('gro.read');
  const canCalendar = useCan('calendar.read');
  const canIntegrations = useCan('integration.google-calendar');
  const canReports = useCan('report.read');
  const canAudit = useCan('audit.read');
  const canStaffUsers = useCan('staff-user.read');
  const canPortal = useCan('portal.read');
  // Employee self-service (SS-07): only the employee role holds this.
  const canSelfService = useCan('self-service.read');

  const groups: Group[] = canSelfService
    ? [
        // An employee's whole surface is their own file — two screens, so (like
        // the portal) one ungrouped section: a heading over it would be chrome.
        {
          items: [
            // The prototype's employee nav, in its order and icons (DS-04).
            { href: '/me', label: t('nav.myFile'), icon: IdCard, exact: true },
            { href: '/me/requests', label: t('nav.myRequests'), icon: MessageSquare },
            { href: '/me/leave', label: t('nav.myLeave'), icon: Plane },
          ],
        },
      ]
    : canPortal
      ? [
          {
            items: [
              // DS-18: the client manager's Overview is their home, as in the prototype.
              { href: '/overview', label: t('nav.overview'), icon: LayoutGrid },
              { href: '/portal/company', label: t('nav.portalCompany'), icon: Building2 },
              { href: '/portal/employees', label: t('nav.portalEmployees'), icon: UsersRound },
              { href: '/portal/documents', label: t('nav.portalDocuments'), icon: FileText },
              // No "Portal users" since ROLE-03: Administrators manage a client's
              // portal accounts from Clients (ADR-013).
            ],
          },
        ]
      : [
          // The prototype's "Workspace" list, in its order, labels and icons
          // (DS-04, ADR-012). Where a prototype screen is not built yet, its row
          // opens the closest existing screen until that screen's card lands:
          // Overview → Today, Work queue → Tasks, People → Employees, Hiring →
          // Vacancies, Roles and permissions → Staff users. Leaves opens a
          // "coming soon" page. Gates are still today's permissions — the
          // prototype's role filters arrive with the 5-role model (ROLE-01).
          {
            heading: t('nav.workspace'),
            items: [
              { href: '/overview', label: t('nav.overview'), icon: LayoutGrid },
              ...(canCalendar
                ? [{ href: '/calendar', label: t('nav.calendar'), icon: CalendarDays }]
                : []),
              ...(canTasks
                ? [
                    {
                      href: '/queue',
                      label: t('nav.workQueue'),
                      icon: Inbox,
                      count: counts.tasks,
                      countLabel: t('nav.countTasks', { count: counts.tasks ?? 0 }),
                    },
                  ]
                : []),
              ...(canRequests
                ? [
                    {
                      href: '/requests',
                      label: t('nav.requests'),
                      icon: MessageSquare,
                      count: counts.requests,
                      countLabel: t('nav.countRequests', { count: counts.requests ?? 0 }),
                    },
                  ]
                : []),
              { href: '/leaves', label: t('nav.leaves'), icon: Plane },
              ...(canEmployees
                ? [{ href: '/employees', label: t('nav.people'), icon: Users }]
                : []),
              ...(canVacancies
                ? [{ href: '/hiring', label: t('nav.hiring'), icon: UserPlus }]
                : []),
              ...(canClients
                ? [{ href: '/clients', label: t('nav.clients'), icon: Building2 }]
                : []),
              ...(canStaffUsers
                ? [{ href: '/staff-users', label: t('nav.rolesAndPermissions'), icon: ShieldCheck }]
                : []),
              ...(canReports
                ? [{ href: '/reports', label: t('nav.reports'), icon: ChartColumn }]
                : []),
              ...(canAudit ? [{ href: '/audit', label: t('nav.auditTrail'), icon: History }] : []),
            ],
          },
          // TEMPORARY (DS-04): today's screens the prototype has no nav entry for,
          // kept reachable until a redesigned screen absorbs each one — documents
          // into the person record, expiry into Overview's runway, GRO into the
          // work queue, Google Calendar into Calendar. (Candidates went into Hiring
          // in DS-09; Tasks moved here in DS-12, until DS-13's work-item dialog
          // takes over editing.)
          // A row leaves this group when its absorbing screen's card lands.
          {
            heading: t('nav.otherTools'),
            items: [
              ...(canDocuments
                ? [{ href: '/documents', label: t('nav.documents'), icon: FileText }]
                : []),
              ...(canDocuments
                ? [{ href: '/expiry', label: t('nav.expiry'), icon: Activity }]
                : []),
              ...(canGro ? [{ href: '/gro', label: t('nav.gro'), icon: Landmark }] : []),
              ...(canTasks ? [{ href: '/tasks', label: t('nav.tasks'), icon: ClipboardList }] : []),
              ...(canIntegrations
                ? [{ href: '/integrations', label: t('nav.integrations'), icon: CalendarCheck }]
                : []),
            ],
          },
        ].filter((g) => g.items.length > 0);

  // The prototype's "Saved views" section — staff only (it hides them for client
  // managers and employees). Not built: shown, labelled, NOT faked (owner
  // decision — unbuilt parts appear "coming soon").
  const showSavedViews = !canSelfService && !canPortal;

  return (
    <nav
      className={cn('flex flex-1 flex-col gap-0.5 p-2', className)}
      aria-label={t('nav.console')}
    >
      {groups.map((group, i) => (
        <div key={group.heading ?? i} className="contents">
          <div className={cn('flex flex-col gap-0.5', i > 0 && 'pt-3')}>
            {group.heading && (
              // Tracking is LTR-only. Chrome 152 skips letter-spacing on Arabic
              // outright (measured in DS-03); the guard covers engines that apply
              // it to cursive scripts, and `uppercase` is a no-op there anyway.
              <span className="px-2 pt-1.5 pb-1 text-[11px] leading-4 font-medium text-muted-foreground uppercase ltr:tracking-[0.05em]">
                {group.heading}
              </span>
            )}
            {group.items.map((item) => (
              <NavRow key={item.href} item={item} variant={variant} pathname={pathname} />
            ))}
          </div>
          {/* The prototype puts Saved views directly under Workspace; the
              temporary "Other tools" group stays below both. */}
          {i === 0 && showSavedViews && (
            <div className="flex flex-col gap-0.5">
              {/* The prototype: 16px 8px 4px, 11/16 medium uppercase. */}
              <span className="px-2 pt-4 pb-1 text-[11px] leading-4 font-medium text-muted-foreground uppercase ltr:tracking-[0.05em]">
                {t('nav.savedViews')}
              </span>
              <span className="flex h-8 items-center gap-2.5 px-2 text-[13px] leading-[18px] text-muted-foreground">
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-neutral-300" />
                {t('states.comingSoon')}
              </span>
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}

// The pinned foot of the sidebar and the sheet (DS-02): Settings, then who is
// signed in, then sign-out. Sign-out moved here from the header — it belongs
// with the identity it ends, and the design keeps the header for location.
export function NavFoot({ variant = 'sidebar' }: { variant?: Variant }) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const me = useSession();
  // Employees hold config.read-self (SS-07 — the header's language switcher
  // remembers their choice), but the Settings SCREEN is staff/portal furniture;
  // their surface is /me, and the shell sends them back there.
  const canSettings = useCan('config.read-self') && me.principalType !== 'employee';
  const [busy, setBusy] = useState(false);

  // Real revocation (AUTH-05): POST /auth/logout destroys the server session,
  // then back to sign-in regardless of the call's outcome.
  async function signOut() {
    setBusy(true);
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // Even if revocation fails, drop the user back to sign-in.
    } finally {
      router.replace('/login');
    }
  }

  return (
    <div className="flex shrink-0 flex-col gap-0.5 border-t p-2">
      {canSettings && (
        <NavRow
          item={{ href: '/settings', label: t('nav.settings'), icon: Settings }}
          variant={variant}
          pathname={pathname}
        />
      )}
      <div
        className={cn('flex items-center gap-2.5 px-2 pt-3 pb-1', canSettings && 'mt-1 border-t')}
      >
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-medium text-sidebar-accent-foreground"
        >
          {initialsOf(me.displayName)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="truncate text-[13px] leading-[17px] font-medium">
            {me.displayName ?? t('nav.console')}
          </span>
          <span className="truncate text-[11px] leading-[15px] text-muted-foreground">
            {t(`roles.${me.role}`)}
          </span>
        </span>
        <button
          type="button"
          onClick={signOut}
          disabled={busy}
          aria-label={t('auth.signOut')}
          title={t('auth.signOut')}
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50',
            // 26px on a desktop pointer (above 2.5.8's 24px); 44px for a thumb.
            variant === 'sheet' ? 'size-11' : 'size-[26px]',
          )}
        >
          <LogOut aria-hidden strokeWidth={1.5} className="size-3.5 rtl:-scale-x-100" />
        </button>
      </div>
    </div>
  );
}
