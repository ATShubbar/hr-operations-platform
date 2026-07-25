'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { CalendarViewResponse, DocumentListResponse, MeResponse } from '@hr/contracts';

import { Link, useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { dualDate, type Locale } from '@/lib/employee-format';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError } from '@/components/ui/load-state';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';

// "Today" (UX-04) — the home screen the product never had.
//
// This is an operations console, and the objects in it are WORK ITEMS WITH OWNERS
// AND DEADLINES, not streaming measurements. That makes the right model a
// prioritised work queue — closer to Linear's "My Issues" than to a monitoring
// dashboard: sections in urgency order, and a section only appears when it has
// something in it.
//
// It re-projects data we already had rather than adding any: /calendar/view
// already merges own events with ACTIVE Task, Request and GRO deadlines, each
// source gated by its own read permission. That gating is what makes this page
// role-aware for free — a recruiter has no gro.read, so GRO items never arrive,
// and Finance (excluded from recruitment and GRO by the permission matrix) sees a
// genuinely shorter page rather than four empty sections.
//
// DELIBERATELY NO KPI TILE STRIP. The rule from the research is that a metric
// earns its place only with a baseline, a direction, a threshold and a
// click-through. We have no history table, so a baseline and a trend would have to
// be invented — and an invented sparkline on a compliance screen is worse than no
// sparkline. What survives the test is a threshold-native count that opens the rows
// behind it, so the counts live in the section headers where they are already
// clickable. A proper metric strip needs a snapshot mechanism; that is a Reporting
// decision, not a home-screen one.

type Kind = 'task' | 'request' | 'gro' | 'event' | 'document';

interface Item {
  id: string;
  kind: Kind;
  title: string;
  /** ISO date the thing is due, or the event's start. */
  when: string;
  status: string | null;
  href: string;
  /** Whole days from today; negative = overdue. */
  days: number;
}

const HREF: Record<Kind, string> = {
  task: '/tasks',
  request: '/requests',
  gro: '/gro',
  event: '/calendar',
  document: '/expiry',
};

/** Whole days from today, UTC-anchored so a local offset never shifts a bucket. */
function daysUntil(iso: string): number {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const d = new Date(iso);
  const target = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}

function isoOffset(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function TodayPage() {
  const t = useTranslations('today');
  // Skeleton and error-state copy lives in one shared namespace: a per-screen
  // `loading` key silently announced "calendar.loading" to screen readers when
  // the namespace happened not to define one (UX-06).
  const tStates = useTranslations('states');
  // /calendar/view returns raw API enums — and for GRO items it uses the process
  // TYPE as the title, so an untranslated `iqama_renewal` would appear as a
  // headline on the app's most-read screen. Each domain screen already owns a
  // label map, so reuse those rather than inventing a third vocabulary.
  const tGro = useTranslations('gro');
  const tReq = useTranslations('requests');
  const tTask = useTranslations('tasks');
  const tDoc = useTranslations('documents');
  const locale = useLocale() as Locale;
  const router = useRouter();

  const [items, setItems] = useState<Item[]>([]);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Enum → label, per kind. Falls back to the raw value so a new server-side enum
  // shows up as itself rather than crashing the page.
  const label = useCallback(
    (kind: Kind, value: string | null): string | null => {
      if (!value) return null;
      const has = (tt: (k: string) => string, key: string) => {
        try {
          return tt(key);
        } catch {
          return value;
        }
      };
      if (kind === 'gro') return has(tGro as never, `status.${value}`);
      if (kind === 'request') return has(tReq as never, `status.${value}`);
      if (kind === 'task') return has(tTask as never, `status.${value}`);
      // For a document the "status" slot carries its CATEGORY (iqama, passport…),
      // which is the useful thing to show next to an expiry.
      if (kind === 'document') return has(tDoc as never, `category.${value}`);
      return value;
    },
    [tGro, tReq, tTask, tDoc],
  );

  const groTitle = useCallback(
    (raw: string): string => {
      try {
        return (tGro as never as (k: string) => string)(`type.${raw}`);
      } catch {
        return raw;
      }
    },
    [tGro],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const actor = await apiFetch<MeResponse>('/auth/me');
      setMe(actor);

      const collected: Item[] = [];

      // Deadlines + own events. A wide window on purpose: overdue work is the
      // whole point of this screen, so we look back as well as forward.
      const view = await apiFetch<CalendarViewResponse>(
        `/calendar/view?from=${isoOffset(-120)}&to=${isoOffset(30)}`,
      );
      for (const it of view.items) {
        collected.push({
          id: `${it.kind}-${it.id}`,
          kind: it.kind as Kind,
          // GRO's "title" from the view IS the process type enum.
          title: it.kind === 'gro' ? groTitle(it.title) : it.title,
          when: it.startAt,
          status: it.status,
          href: HREF[it.kind as Kind] ?? '/today',
          days: daysUntil(it.startAt),
        });
      }

      // Expiring documents — the compliance half, and the reason this product
      // exists. Only for document.read holders; the catch is harmless otherwise.
      if (actor.permissions.includes('document.read')) {
        try {
          const docs = await apiFetch<DocumentListResponse>(
            `/documents?expiringBefore=${isoOffset(30)}`,
          );
          for (const d of docs.documents) {
            if (!d.expiryDate) continue;
            collected.push({
              id: `document-${d.id}`,
              kind: 'document',
              title: d.title,
              when: d.expiryDate,
              status: d.category,
              href: '/expiry',
              days: daysUntil(d.expiryDate),
            });
          }
        } catch {
          // A partial page beats a failed one: the deadlines above are still useful.
        }
      }

      collected.sort((a, b) => a.days - b.days);
      setItems(collected);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login');
        return;
      }
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  }, [router, t, groTitle]);

  useEffect(() => {
    void load();
  }, [load]);

  // Sections in urgency order. Each appears only when non-empty — an empty
  // section is noise, and a page of them reads as a broken product.
  const sections = useMemo(() => {
    const overdue = items.filter((i) => i.days < 0);
    const today = items.filter((i) => i.days === 0);
    const week = items.filter((i) => i.days > 0 && i.days <= 7);
    const later = items.filter((i) => i.days > 7);
    return [
      { key: 'overdue' as const, tone: 'critical' as StatusTone, items: overdue },
      { key: 'today' as const, tone: 'warning' as StatusTone, items: today },
      { key: 'week' as const, tone: 'warning' as StatusTone, items: week },
      { key: 'later' as const, tone: 'neutral' as StatusTone, items: later },
    ].filter((s) => s.items.length > 0);
  }, [items]);

  // No greeting by name: there is no staff-user directory yet, so /auth/me gives a
  // userId and a role but no display name. Inventing one from an email local-part
  // would be worse than not greeting. The role is honest and actually useful —
  // it tells you which slice of work this page is showing.
  const todayLabel = dualDate(new Date().toISOString(), locale);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">
            {todayLabel}
            {me ? ` · ${t(`role.${me.role}`)}` : ''}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {t('refresh')}
        </Button>
      </div>

      {error && (
        <LoadError message={error} onRetry={() => void load()} hasContent={items.length > 0} />
      )}

      {loading && (
        <SkeletonRegion label={tStates('loading')} className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-lg border bg-card p-4">
              <Skeleton className="mb-3 h-3 w-24" />
              <Skeleton className="mb-2 h-3.5 w-2/3" />
              <Skeleton className="h-3.5 w-1/2" />
            </div>
          ))}
        </SkeletonRegion>
      )}

      {!loading && !error && sections.length === 0 && (
        // The all-clear is INFORMATION, not an absence of it. In an ops console
        // "nothing is overdue" is a state people need to be able to trust, so it
        // gets stated affirmatively rather than leaving an empty container.
        <EmptyState
          variant="first-run"
          title={t('allClear')}
          description={t('allClearHint')}
          icon={<span className="text-2xl">✓</span>}
        />
      )}

      {!loading &&
        sections.map((section) => (
          <section key={section.key} className="space-y-2">
            <div className="flex items-center gap-2">
              <StatusPill tone={section.tone}>{t(`section.${section.key}`)}</StatusPill>
              <span className="text-sm tabular-nums text-muted-foreground">
                {section.items.length}
              </span>
            </div>
            <ul className="divide-y rounded-lg border bg-card">
              {section.items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40"
                  >
                    {/* A start-edge stripe rather than a tinted row: a screen of
                        coloured rows is the wall-of-red that makes none of it read
                        as urgent. */}
                    <span
                      aria-hidden
                      className="h-8 w-0.5 shrink-0 rounded-full"
                      style={{
                        background:
                          section.tone === 'critical'
                            ? 'var(--status-critical)'
                            : section.tone === 'warning'
                              ? 'var(--status-warning)'
                              : 'var(--status-neutral-line)',
                      }}
                    />
                    {/* Stacks below sm (UX-05). Side by side, the fixed date block
                        left the title about 180px at 375px, so every row read as
                        an ellipsis. Nothing is dropped on mobile — it reflows. */}
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{item.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {t(`kind.${item.kind}`)}
                          {label(item.kind, item.status)
                            ? ` · ${label(item.kind, item.status)}`
                            : ''}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-baseline gap-2 text-start sm:block sm:text-end">
                        <span className="text-xs tabular-nums">
                          {item.days < 0
                            ? t('overdueBy', { days: -item.days })
                            : item.days === 0
                              ? t('dueToday')
                              : t('inDays', { days: item.days })}
                        </span>
                        {/* Absolute date stays on screen next to the relative one —
                            this is a compliance domain, and "in 3 days" is not
                            something you can book a government appointment against. */}
                        <span className="text-[11px] text-muted-foreground">
                          {dualDate(item.when, locale)}
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

      {!loading && !error && items.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('scopeNote', { count: items.length })}
        </p>
      )}
    </div>
  );
}
