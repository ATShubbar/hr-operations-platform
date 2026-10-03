'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

// The header's location line (DS-02): PEOPLE&GRO / <screen> / <record>.
//
// **This reverses a UI/UX-epic decision, on the owner's instruction.** UX research
// ruled breadcrumbs out (NN/g excludes one- and two-level hierarchies; Polaris
// deleted its component in favour of a single back action), and that reasoning
// still holds for NAVIGATION — the hierarchy here is at most two deep. What the
// design asks for is a LOCATION LINE: it names where you are, which a header
// otherwise leaves to the sidebar's highlighted row, and on a record screen it is
// the only place the record's name appears above the fold on a phone. Only the
// screen crumb links (back to the list); the product name and the current page
// do not, because linking either would be a second route to somewhere already
// one click away.
//
// The current crumb carries NO `aria-current`: it is plain text, not a link, and
// the nav row already marks the page — UX-11 established exactly one
// `aria-current` per screen, and two would announce "current page" twice.

// Ungated on purpose: a recruiter who deep-links to /gro sees the 403 state, and
// the header should still say where they are. The labels are the nav's own keys,
// so the line and the highlighted nav row always agree.
// Order matters where one route is a prefix of another: `/me/requests` must be
// found before `/me` (SS-07), or it would read as a record under "My file".
const SCREENS: { href: string; key: string }[] = [
  { href: '/me/requests', key: 'myRequests' },
  { href: '/me/leave', key: 'myLeave' },
  { href: '/me', key: 'myFile' },
  // DS-04: the prototype's names for the screens that stand in for its rows.
  { href: '/today', key: 'overview' },
  { href: '/leaves', key: 'leaves' },
  { href: '/clients', key: 'clients' },
  { href: '/employees', key: 'people' },
  { href: '/documents', key: 'documents' },
  { href: '/expiry', key: 'expiry' },
  { href: '/requests', key: 'requests' },
  { href: '/tasks', key: 'workQueue' },
  { href: '/gro', key: 'gro' },
  { href: '/calendar', key: 'calendar' },
  { href: '/integrations', key: 'integrations' },
  { href: '/vacancies', key: 'hiring' },
  { href: '/candidates', key: 'candidates' },
  { href: '/reports', key: 'reports' },
  { href: '/staff-users', key: 'rolesAndPermissions' },
  { href: '/audit', key: 'auditTrail' },
  { href: '/settings', key: 'settings' },
  { href: '/portal/company', key: 'portalCompany' },
  { href: '/portal/employees', key: 'portalEmployees' },
  { href: '/portal/documents', key: 'portalDocuments' },
  { href: '/portal/users', key: 'portalUsers' },
];

// A record screen publishes its own name — the header cannot know it, and
// fetching it again here would be a second request for data the page already
// holds.
const RecordContext = createContext<(label: string | null) => void>(() => {});
const RecordLabelContext = createContext<string | null>(null);

export function HeaderLocationProvider({ children }: { children: ReactNode }) {
  const [record, setRecord] = useState<string | null>(null);
  return (
    <RecordContext.Provider value={setRecord}>
      <RecordLabelContext.Provider value={record}>{children}</RecordLabelContext.Provider>
    </RecordContext.Provider>
  );
}

/**
 * Called by a record screen (e.g. employee detail) with the record's display
 * name. The cleanup clears it on unmount, so a stale name never sits over the
 * list the user navigates back to — the screen cannot forget to.
 */
export function useRecordLabel(label: string | null | undefined) {
  const set = useContext(RecordContext);
  useEffect(() => {
    set(label ?? null);
    return () => set(null);
  }, [label, set]);
}

const SEP = (
  <span aria-hidden className="text-muted-foreground/50">
    /
  </span>
);

export function HeaderLocation() {
  const t = useTranslations();
  const pathname = usePathname();
  const record = useContext(RecordLabelContext);

  const screen = SCREENS.find((s) => pathname === s.href || pathname.startsWith(`${s.href}/`));
  const onRecord = Boolean(screen && pathname !== screen.href);
  const screenLabel = screen ? t(`nav.${screen.key}`) : null;

  return (
    <nav aria-label={t('nav.location')} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {/* The product name is context, not a destination — and on a phone the
            screen name is what matters, so it yields first. */}
        <li className="hidden shrink-0 items-center gap-1.5 text-muted-foreground md:flex">
          <span>{t('common.appName')}</span>
          {screenLabel && SEP}
        </li>
        {screenLabel && (
          <li className="flex min-w-0 items-center gap-1.5">
            {onRecord ? (
              <>
                <Link
                  href={screen!.href}
                  className="truncate text-muted-foreground hover:text-foreground hover:underline hover:underline-offset-4"
                >
                  {screenLabel}
                </Link>
                {SEP}
              </>
            ) : (
              <span className="truncate font-medium">{screenLabel}</span>
            )}
          </li>
        )}
        {onRecord && (
          <li className="min-w-0">
            {/* Until the record has loaded there is no name to show; an empty
                current crumb is better than a UUID from the URL. */}
            <span className="block truncate font-medium">{record ?? ''}</span>
          </li>
        )}
        {!screenLabel && <li className="truncate font-medium md:hidden">{t('nav.console')}</li>}
      </ol>
    </nav>
  );
}
