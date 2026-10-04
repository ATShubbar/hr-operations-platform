'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Building2,
  CalendarDays,
  FileStack,
  Inbox,
  ListChecks,
  Search,
  User,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { SearchHit, SearchResponse } from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api';
import type { Locale } from '@/lib/employee-format';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

// The header's global search (SEARCH-01, ADR-015) — the prototype's box:
// "Search people, refs, ID numbers", results in a dropdown under it, each with
// its kind, opening the right screen. GET /search does the finding and every
// permission decision; this only types, shows and navigates.
//
// An accessible combobox (input + listbox, aria-activedescendant): ↑/↓ move,
// Enter opens, Escape closes. On phones the box hides behind a search icon and
// opens as a full-width bar under the header (the prototype is desktop-only).

const ICON: Record<SearchHit['kind'], LucideIcon> = {
  person: User,
  client: Building2,
  procedure: FileStack,
  task: ListChecks,
  request: Inbox,
  leave: CalendarDays,
};

export function GlobalSearch() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const t = useTranslations('search');
  return (
    <>
      <div className="relative hidden w-[264px] md:block">
        <SearchBox />
      </div>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label={t('open')}
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
      >
        <Search className="size-4" aria-hidden />
      </button>
      {mobileOpen && (
        <div className="fixed start-0 end-0 top-14 z-40 border-b bg-background p-3 shadow-md md:hidden">
          <div className="flex items-start gap-2">
            <div className="relative min-w-0 grow">
              <SearchBox autoFocus onDone={() => setMobileOpen(false)} wide />
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label={t('close')}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function SearchBox({
  autoFocus,
  onDone,
  wide,
}: {
  autoFocus?: boolean;
  onDone?: () => void;
  wide?: boolean;
}) {
  const t = useTranslations('search');
  const th = useTranslations('header');
  const tg = useTranslations('gro');
  const tr = useTranslations('requests');
  const tt = useTranslations('tasks');
  const tl = useTranslations('leaves');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const principal = useSession().principalType;
  const listId = useId();

  const [q, setQ] = useState('');
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const seq = useRef(0);

  // As the user types: wait 250ms of quiet, then ask; a slower earlier answer
  // never overwrites a newer one.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResult(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      apiFetch<SearchResponse>(`/search?q=${encodeURIComponent(term)}`)
        .then((r) => {
          if (mine === seq.current) {
            setResult(r);
            setActive(0);
          }
        })
        .catch(() => mine === seq.current && setResult({ hits: [], truncated: false }))
        .finally(() => mine === seq.current && setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  const nm = (n: { nameEn: string; nameAr: string } | null | undefined) =>
    n ? (locale === 'ar' ? n.nameAr : n.nameEn) : '';

  function describe(h: SearchHit): { title: string; sub: string } {
    switch (h.kind) {
      case 'person': {
        const job = locale === 'ar' ? h.jobTitleAr : h.jobTitleEn;
        const how = h.matchedOn === 'name' ? null : t(`matchedOn.${h.matchedOn}`);
        return { title: nm(h), sub: [how, job, nm(h.client)].filter(Boolean).join(' · ') };
      }
      case 'client':
        return { title: nm(h), sub: t('kind.client') };
      case 'procedure':
        return {
          title: h.reference ?? tg(`type.${h.type}`),
          sub: [h.reference ? tg(`type.${h.type}`) : null, nm(h.employee), tg(`status.${h.status}`)]
            .filter(Boolean)
            .join(' · '),
        };
      case 'task':
        return { title: h.title, sub: tt(`status.${h.status}`) };
      case 'request':
        return {
          title: h.title,
          sub: [tr(`type.${h.type}`), tr(`status.${h.status}`), nm(h.client)].filter(Boolean).join(' · '),
        };
      case 'leave':
        return {
          title: `${h.ref} · ${tl(`type.${h.type}`)}`,
          sub: [nm(h.employee), tl(`listStatus.${h.status}`)].join(' · '),
        };
    }
  }

  // Where each kind opens, for this kind of reader.
  function hrefOf(h: SearchHit): string {
    const employee = principal === 'employee';
    const client = principal === 'client_rep';
    switch (h.kind) {
      case 'person':
        return client ? `/portal/employees/${h.id}` : `/employees/${h.id}`;
      case 'client':
        return `/clients/${h.id}`;
      case 'procedure':
        return h.employee ? `/employees/${h.employee.id}?tab=work` : '/queue?kind=procedure';
      case 'task':
        return '/queue?kind=task';
      case 'request':
        return employee ? `/me/requests?r=${h.id}` : `/requests?r=${h.id}`;
      case 'leave':
        return employee ? `/me/leave?l=${h.id}` : `/leaves?l=${h.id}`;
    }
  }

  const hits = result?.hits ?? [];
  const showList = open && q.trim().length >= 2;

  function go(h: SearchHit) {
    setOpen(false);
    setQ('');
    onDone?.();
    router.push(hrefOf(h));
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      onDone?.();
      return;
    }
    if (!hits.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % hits.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + hits.length) % hits.length);
    } else if (e.key === 'Enter' && showList) {
      e.preventDefault();
      go(hits[active]!);
    }
  }

  return (
    <>
      <input
        type="search"
        role="combobox"
        aria-label={t('label')}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && hits[active] ? `${listId}-${active}` : undefined}
        autoFocus={autoFocus}
        value={q}
        placeholder={th('searchPlaceholder')}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Close after a click on a result has landed (mousedown below keeps focus).
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKey}
        className="h-7 w-full rounded-md border border-input bg-transparent px-2.5 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      />
      {showList && (
        <div
          className={cn(
            'absolute top-9 z-50 overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10',
            wide ? 'start-0 end-0' : 'end-0 w-[400px]',
          )}
        >
          <ul id={listId} role="listbox" aria-label={t('label')} className="max-h-[70vh] overflow-y-auto py-1">
            {hits.map((h, i) => {
              const d = describe(h);
              const Icon = ICON[h.kind];
              return (
                <li
                  key={`${h.kind}-${h.id}`}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(h)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 px-3 py-2',
                    i === active && 'bg-accent',
                  )}
                >
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="flex min-w-0 grow flex-col">
                    <span className="truncate text-[13px] leading-[17px]">{d.title}</span>
                    {d.sub && (
                      <span className="truncate text-[11px] leading-[15px] text-muted-foreground">{d.sub}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-[10px] text-neutral-400 uppercase ltr:tracking-[0.04em]">
                    {t(`kind.${h.kind}`)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p
            role="status"
            className="border-t px-3 py-2 text-xs leading-4 text-pretty text-muted-foreground"
          >
            {loading && !result
              ? t('searching')
              : hits.length === 0
                ? t('none', { q: q.trim() })
                : result?.truncated
                  ? t('more')
                  : t('results', { count: hits.length })}
            {principal === 'staff' && <span className="block text-neutral-400">{t('soon')}</span>}
          </p>
        </div>
      )}
    </>
  );
}
