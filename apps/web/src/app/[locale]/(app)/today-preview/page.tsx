'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Geist } from 'next/font/google';
import type { CalendarViewResponse, DocumentListResponse, MeResponse } from '@hr/contracts';

import { Link, useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { dualDate, type Locale } from '@/lib/employee-format';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/load-state';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { useViewItemLabels } from '@/lib/view-item-labels';

// THROWAWAY PREVIEW — not part of the product, not committed.
//
// "Today", re-thought from scratch against the Shadcn Design System file rather
// than against our existing screen. What that file actually supplies is a token
// scale (Geist, a neutral ramp, 4px spacing steps, 16px 2xl radius) and an
// INVENTORY of components — Card, Tabs, Item, Progress, Badge, Separator,
// Avatar. The component pages themselves are not in the file, so this is built
// from that vocabulary, not traced from artboards.
//
// Geist is loaded here so the typography is honest to the system. It has NO
// ARABIC COVERAGE, so it sits in front of our Plex Arabic and the browser's
// per-character fallback routes Arabic text past it — visible on /ar, and the
// single biggest reason the system's type choice cannot be adopted wholesale.
const geist = Geist({ subsets: ['latin'], display: 'swap' });

type Kind = 'task' | 'request' | 'gro' | 'event' | 'document';

interface Item {
  id: string;
  kind: Kind;
  title: string;
  when: string;
  status: string | null;
  href: string;
  days: number;
}

const HREF: Record<Kind, string> = {
  task: '/tasks',
  request: '/requests',
  gro: '/gro',
  event: '/calendar',
  document: '/expiry',
};

function daysUntil(iso: string): number {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const d = new Date(iso);
  return Math.round(
    (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - today) / 86_400_000,
  );
}

function isoOffset(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type TabKey = 'overdue' | 'today' | 'week' | 'later';

export default function TodayPreviewPage() {
  const t = useTranslations('today');
  const tExpiry = useTranslations('expiry');
  const tStates = useTranslations('states');
  const { statusLabel, titleFor } = useViewItemLabels();
  const locale = useLocale() as Locale;
  const router = useRouter();

  const [items, setItems] = useState<Item[]>([]);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<TabKey>('overdue');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const actor = await apiFetch<MeResponse>('/auth/me');
      setMe(actor);
      const collected: Item[] = [];
      const view = await apiFetch<CalendarViewResponse>(
        `/calendar/view?from=${isoOffset(-120)}&to=${isoOffset(30)}`,
      );
      for (const it of view.items) {
        collected.push({
          id: `${it.kind}-${it.id}`,
          kind: it.kind as Kind,
          title: titleFor(it.kind as Kind, it.title),
          when: it.startAt,
          status: it.status,
          href: HREF[it.kind as Kind] ?? '/today',
          days: daysUntil(it.startAt),
        });
      }
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
          /* partial page beats a failed one */
        }
      }
      collected.sort((a, b) => a.days - b.days);
      setItems(collected);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  }, [router, t, titleFor]);

  useEffect(() => {
    void load();
  }, [load]);

  const buckets = useMemo(
    () => ({
      overdue: items.filter((i) => i.days < 0),
      today: items.filter((i) => i.days === 0),
      week: items.filter((i) => i.days > 0 && i.days <= 7),
      later: items.filter((i) => i.days > 7),
    }),
    [items],
  );

  // A DISTRIBUTION of the present, not a trend. UX-04 refused KPI tiles because a
  // metric needs a baseline and a direction, and we have no history table — but a
  // breakdown of what exists right now invents nothing.
  const compliance = useMemo(() => {
    const docs = items.filter((i) => i.kind === 'document');
    const seg = [
      { key: 'expired', n: docs.filter((d) => d.days < 0).length, color: 'var(--status-critical)' },
      { key: 'd7', n: docs.filter((d) => d.days >= 0 && d.days <= 7).length, color: 'var(--status-warning)' },
      { key: 'd30', n: docs.filter((d) => d.days > 7 && d.days <= 30).length, color: 'var(--status-neutral-line)' },
    ];
    return { seg, total: seg.reduce((a, s) => a + s.n, 0) };
  }, [items]);

  const byKind = useMemo(() => {
    const counts = new Map<Kind, number>();
    for (const i of items) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
    const max = Math.max(1, ...counts.values());
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([kind, n]) => ({ kind, n, pct: Math.round((n / max) * 100) }));
  }, [items]);

  const TABS: { key: TabKey; label: string; n: number }[] = [
    { key: 'overdue', label: t('section.overdue'), n: buckets.overdue.length },
    { key: 'today', label: t('section.today'), n: buckets.today.length },
    { key: 'week', label: t('section.week'), n: buckets.week.length },
    { key: 'later', label: t('section.later'), n: buckets.later.length },
  ];

  const shown = buckets[tab];

  return (
    <div className={`${geist.className} space-y-6`}>
      <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
        Preview — the real Today page is unchanged. Typography is Geist, from the Figma system.
      </p>

      {/* Identity + date. Avatar, from the system's Data Display set. */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground">
            {(me?.displayName ?? '·').charAt(0)}
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {me?.displayName ?? t('title')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {dualDate(new Date().toISOString(), locale)}
              {me ? ` · ${t(`role.${me.role}`)}` : ''}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {t('refresh')}
        </Button>
      </div>

      {error && <LoadError message={error} onRetry={() => void load()} hasContent={items.length > 0} />}

      {loading && items.length === 0 ? (
        <SkeletonRegion label={tStates('loading')} className="space-y-4">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </SkeletonRegion>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            {/* Compliance distribution — a segmented bar, the Progress idea from
                the system applied to a real breakdown rather than a fake trend. */}
            {compliance.total > 0 && (
              <section className="rounded-2xl border bg-card p-6">
                <div className="mb-4 flex items-baseline justify-between gap-4">
                  <h2 className="text-base font-medium">{locale === 'ar' ? 'الالتزام' : 'Compliance'}</h2>
                  <Link href="/expiry" className="text-xs text-muted-foreground hover:underline">
                    {compliance.total}
                  </Link>
                </div>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  {compliance.seg.map((s) =>
                    s.n > 0 ? (
                      <span
                        key={s.key}
                        style={{ width: `${(s.n / compliance.total) * 100}%`, background: s.color }}
                        title={`${s.key}: ${s.n}`}
                      />
                    ) : null,
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                  {compliance.seg.map((s) => (
                    <span key={s.key} className="flex items-center gap-2 text-sm">
                      <span
                        aria-hidden
                        className="size-2 rounded-full"
                        style={{ background: s.color }}
                      />
                      <span className="tabular-nums font-medium">{s.n}</span>
                      <span className="text-muted-foreground">
                        {tExpiry(`bucket.${s.key}`)}
                      </span>
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* The queue, behind Tabs instead of four stacked sections. */}
            <section className="rounded-2xl border bg-card">
              <div className="flex flex-wrap gap-1 border-b p-2">
                {TABS.map((tb) => (
                  <button
                    key={tb.key}
                    type="button"
                    onClick={() => setTab(tb.key)}
                    aria-current={tab === tb.key ? 'true' : undefined}
                    className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                      tab === tb.key
                        ? 'bg-muted font-medium text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tb.label}
                    <span className="rounded-full bg-foreground/10 px-1.5 text-[11px] tabular-nums">
                      {tb.n}
                    </span>
                  </button>
                ))}
              </div>

              {shown.length === 0 ? (
                <p className="p-10 text-center text-sm text-muted-foreground">{t('allClear')}</p>
              ) : (
                <ul className="divide-y">
                  {shown.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        className="flex items-center gap-4 px-6 py-3.5 hover:bg-muted/40"
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-sm font-medium">{item.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {t(`kind.${item.kind}`)}
                            {statusLabel(item.kind, item.status)
                              ? ` · ${statusLabel(item.kind, item.status)}`
                              : ''}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-0.5 text-end">
                          <span
                            className={`text-xs font-medium tabular-nums ${
                              item.days < 0 ? 'text-status-critical' : ''
                            }`}
                          >
                            {item.days < 0
                              ? t('overdueBy', { days: -item.days })
                              : item.days === 0
                                ? t('dueToday')
                                : t('inDays', { days: item.days })}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {dualDate(item.when, locale)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Right rail: what the workload is made of. Counts, proportional bars,
              no invented history. */}
          <aside className="space-y-6">
            <section className="rounded-2xl border bg-card p-6">
              <h2 className="mb-4 text-base font-medium">
                {locale === 'ar' ? 'حسب النوع' : 'By type'}
              </h2>
              <ul className="space-y-3">
                {byKind.map((k) => (
                  <li key={k.kind} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span>{t(`kind.${k.kind}`)}</span>
                      <span className="tabular-nums font-medium">{k.n}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary/70"
                        style={{ width: `${k.pct}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
