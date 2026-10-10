'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';
import type {
  EscalationCountResponse,
  EscalationItem,
  EscalationLadderResponse,
  NotificationListResponse,
  NotificationResponse,
} from '@hr/contracts';
import {
  ACTION_STAGES,
  ESCALATION_STAGES,
  type EscalationStage,
} from '@hr/contracts/escalation-rules';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { chipClass } from '@/lib/employee-docs';
import { useCan, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { EscalationRulesDialog } from '@/components/escalation-rules-dialog';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';

// The notification centre (NC-03, ADR-021) — the prototype's panel behind the
// header bell.
//
// It is NOT a feed. Three of its tabs show the ESCALATION LADDER, which the
// server works out for the signed-in person each time: what has reached which
// stage. Nothing in those tabs is stored but the read marks.
//   · Needs action   — what this person is told about, at Escalated or Breach
//   · Assigned to me — what this person owns
//   · Everything     — every item they may read
// The fourth tab, Updates, is the one deviation from the prototype (owner
// decision): the events the bell has always listed — a request decided, a
// comment, a hand-over, a leave decision — unchanged.
//
// Someone who does not hold `escalation.read` (client managers and employees,
// until NC-05) gets the Updates list alone, exactly as the bell was.
//
// The bell's number is the unread Needs-action items plus the unread updates.

type Locale = 'ar' | 'en';
type Tab = 'action' | 'mine' | 'all' | 'updates';
const POLL_MS = 60_000;
const PER_STAGE = 12; // the prototype's cap per stage; the rest are a line
const MARK_CHUNK = 200; // the API's limit per call
// Most urgent first — the order the groups are drawn in.
const GROUP_ORDER: readonly EscalationStage[] = [...ESCALATION_STAGES].reverse();

// The prototype's stage colours: the dot of each group and the rule down the
// side of each item.
const STAGE_DOT: Record<EscalationStage, string> = {
  breach: 'bg-status-critical',
  escalation: 'bg-status-warning',
  reminder: 'bg-neutral-500',
  notice: 'bg-neutral-400',
};
const STAGE_EDGE: Record<EscalationStage, string> = {
  breach: 'border-s-status-critical',
  escalation: 'border-s-status-warning',
  reminder: 'border-s-neutral-500',
  notice: 'border-s-neutral-400',
};

// Largest-unit relative time, localized. Under a minute is "just now".
function relativeTime(iso: string, locale: Locale, justNow: string): string {
  const sec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return justNow;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const min = Math.round(sec / 60);
  if (min < 60) return rtf.format(-min, 'minute');
  const hr = Math.round(min / 60);
  if (hr < 24) return rtf.format(-hr, 'hour');
  const day = Math.round(hr / 24);
  if (day < 30) return rtf.format(-day, 'day');
  const mon = Math.round(day / 30);
  if (mon < 12) return rtf.format(-mon, 'month');
  return rtf.format(-Math.round(mon / 12), 'year');
}

/** Where an item is acted on. */
function hrefOf(item: EscalationItem): string {
  const s = item.subject;
  switch (s.kind) {
    case 'document':
      return `/employees/${s.employee.id}?tab=docs`;
    case 'dependant_document':
      return `/employees/${s.employee.id}?tab=family`;
    case 'request':
      return `/requests?r=${s.id}`;
    case 'procedure':
      return `/queue?open=procedure-${s.id}`;
    case 'task':
      return `/queue?open=task-${s.id}`;
  }
}

export function NotificationCentre() {
  const t = useTranslations('notifications');
  const tc = useTranslations('notifications.centre');
  const tp = useTranslations('people');
  const tg = useTranslations('gro');
  const tq = useTranslations('requests');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const me = useSession();
  // The ladder is staff-only until NC-05; `escalation.read` says who has it.
  const hasLadder = useCan('escalation.read') && me.principalType === 'staff';

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(hasLadder ? 'action' : 'updates');
  const [ladder, setLadder] = useState<EscalationLadderResponse | null>(null);
  const [updates, setUpdates] = useState<NotificationResponse[]>([]);
  const [unreadUpdates, setUnreadUpdates] = useState(0);
  const [needsAction, setNeedsAction] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const signedOut = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) router.replace('/login');
    },
    [router],
  );

  // The bell's number: two light reads, polled.
  const refreshCount = useCallback(async () => {
    try {
      const [n, e] = await Promise.all([
        apiFetch<NotificationListResponse>('/notifications'),
        hasLadder
          ? apiFetch<EscalationCountResponse>('/escalations/count')
          : Promise.resolve({ needsAction: 0 }),
      ]);
      setUnreadUpdates(n.unreadCount);
      setNeedsAction(e.needsAction);
    } catch (err) {
      signedOut(err);
    }
  }, [hasLadder, signedOut]);
  useEffect(() => {
    void refreshCount();
    const id = setInterval(() => void refreshCount(), POLL_MS);
    return () => clearInterval(id);
  }, [refreshCount]);

  // Everything the panel shows, when it opens.
  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [n, l] = await Promise.all([
        apiFetch<NotificationListResponse>('/notifications'),
        hasLadder ? apiFetch<EscalationLadderResponse>('/escalations') : Promise.resolve(null),
      ]);
      setUpdates(n.notifications);
      setUnreadUpdates(n.unreadCount);
      setLadder(l);
      if (l) {
        setNeedsAction(
          l.items.filter((i) => i.told && !i.read && ACTION_STAGES.includes(i.stage)).length,
        );
      }
    } catch (err) {
      signedOut(err);
      setFailed(true);
    }
  }, [hasLadder, signedOut]);

  async function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setLoading(true);
      await load();
      setLoading(false);
    }
  }

  // ---- the ladder's three pools ----
  const items = ladder?.items ?? [];
  const pools: Record<Exclude<Tab, 'updates'>, EscalationItem[]> = {
    action: items.filter((i) => i.told && ACTION_STAGES.includes(i.stage)),
    mine: items.filter((i) => i.mine),
    all: items,
  };
  const pool = tab === 'updates' ? [] : pools[tab];

  const name = (n: { ar: string | null; en: string }) => (locale === 'ar' ? n.ar || n.en : n.en);
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
      numberingSystem: 'latn',
    }).format(new Date(`${iso}T00:00:00Z`));

  // What the item says, by what it is about and how many days are left.
  const when = (days: number): 'lapsed' | 'today' | 'ahead' =>
    days < 0 ? 'lapsed' : days === 0 ? 'today' : 'ahead';
  function titleOf(i: EscalationItem): string {
    const s = i.subject;
    const w = when(i.daysLeft);
    const count = Math.abs(i.daysLeft);
    switch (s.kind) {
      case 'document':
        return tc(`title.document.${w}`, { doc: tc(`doc.${s.doc}`), count });
      case 'dependant_document':
        return tc(`title.dependant.${w}`, {
          doc: tc(`dependantDoc.${s.doc}`),
          name: name(s.dependant.name),
          count,
        });
      case 'procedure':
        return tc(`title.work.${w}`, { what: tg(`type.${s.type}`), count });
      case 'task':
        return tc(`title.work.${w}`, { what: s.title, count });
      case 'request':
        return tc(`title.request.${w}`, { type: tq(`type.${s.type}`), count });
    }
  }
  function subjectOf(i: EscalationItem): string | null {
    const s = i.subject;
    if (s.kind === 'task') return null;
    if (s.kind === 'request') return s.title;
    return name(s.employee.name);
  }
  function metaOf(i: EscalationItem): string {
    const owner =
      i.owner === null
        ? tc('unassigned')
        : i.owner.kind === 'person'
          ? (i.owner.name ?? tc('unnamed'))
          : tc(`ownerRole.${i.owner.role}`);
    return [i.client ? name(i.client.name) : null, owner, tc(`rule.${i.rule}`)]
      .filter(Boolean)
      .join(' · ');
  }

  async function markKeys(keys: string[]) {
    for (let at = 0; at < keys.length; at += MARK_CHUNK) {
      await apiFetch('/escalations/read', {
        method: 'POST',
        body: JSON.stringify({ keys: keys.slice(at, at + MARK_CHUNK) }),
      });
    }
  }

  // Opening an item marks it read and goes to where it is acted on.
  async function openItem(i: EscalationItem) {
    setOpen(false);
    router.push(hrefOf(i));
    if (i.read) return;
    try {
      await markKeys([i.key]);
      setLadder((l) =>
        l ? { ...l, items: l.items.map((x) => (x.key === i.key ? { ...x, read: true } : x)) } : l,
      );
      if (i.told && ACTION_STAGES.includes(i.stage)) setNeedsAction((n) => Math.max(0, n - 1));
    } catch (err) {
      signedOut(err);
    }
  }

  async function openUpdate(n: NotificationResponse) {
    if (n.readAt) return;
    try {
      await apiFetch(`/notifications/${n.id}/read`, { method: 'POST' });
      setUpdates((xs) =>
        xs.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)),
      );
      setUnreadUpdates((u) => Math.max(0, u - 1));
    } catch (err) {
      signedOut(err);
    }
  }

  // "Mark all read" is about the tab in view, as in the prototype.
  const unreadInTab =
    tab === 'updates' ? updates.some((x) => !x.readAt) : pool.some((i) => !i.read);
  async function markAll() {
    try {
      if (tab === 'updates') {
        await apiFetch('/notifications/read-all', { method: 'POST' });
        setUpdates((xs) => xs.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
        setUnreadUpdates(0);
        return;
      }
      await markKeys(pool.filter((i) => !i.read).map((i) => i.key));
      await load();
    } catch (err) {
      signedOut(err);
    }
  }

  const total = needsAction + unreadUpdates;
  const tabs: Array<{ value: Tab; label: string; n: number }> = hasLadder
    ? [
        { value: 'action', label: tc('tab.action'), n: pools.action.length },
        { value: 'mine', label: tc('tab.mine'), n: pools.mine.length },
        { value: 'all', label: tc('tab.all'), n: pools.all.length },
        { value: 'updates', label: tc('tab.updates'), n: unreadUpdates },
      ]
    : [];

  const groups = GROUP_ORDER.map((stage) => ({
    stage,
    all: pool.filter((i) => i.stage === stage),
  })).filter((g) => g.all.length > 0);

  return (
    <Popover open={open} onOpenChange={(next) => void onOpenChange(next)}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={t('open')}
            className="relative flex size-8 items-center justify-center rounded-md text-neutral-700 transition-colors hover:bg-accent"
          />
        }
      >
        <Bell className="size-[17px]" aria-hidden />
        {total > 0 && (
          <span
            className="absolute -end-0.5 top-px flex h-4 min-w-4 items-center justify-center rounded-full bg-status-critical px-1 font-mono text-[10px] leading-4 text-white ring-2 ring-card"
            // Decoration beside a labelled button: the label below carries the
            // number for assistive tech instead of a bare digit.
            aria-hidden
          >
            {total > 99 ? '99+' : total}
          </span>
        )}
        <span className="sr-only">{total > 0 ? t('unreadCount', { count: total }) : ''}</span>
      </PopoverTrigger>

      <PopoverContent className="flex max-h-[min(560px,calc(100dvh-5rem))] w-[428px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl">
        <div className="flex items-center gap-2 px-3.5 pt-3 pb-2.5">
          <div className="flex min-w-0 grow flex-col gap-px">
            <h2 className="text-sm leading-[19px] font-medium">{t('title')}</h2>
            {hasLadder && (
              <p className="text-[11px] leading-[15px] text-muted-foreground">
                <span>
                  <bdi>{tab === 'updates' ? tc('subUpdates') : tc('sub')}</bdi>
                </span>
              </p>
            )}
          </div>
          {unreadInTab && (
            <Button variant="ghost" size="xs" className="shrink-0" onClick={() => void markAll()}>
              {t('markAllRead')}
            </Button>
          )}
        </div>

        {hasLadder && (
          <div
            role="tablist"
            aria-label={t('title')}
            className="flex flex-wrap gap-0.5 px-2.5 pb-2.5"
          >
            {tabs.map((x) => (
              <button
                key={x.value}
                type="button"
                role="tab"
                aria-selected={tab === x.value}
                onClick={() => setTab(x.value)}
                className={cn(
                  'inline-flex h-[26px] shrink-0 items-center gap-1 rounded-full px-2 text-xs whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                  tab === x.value ? 'bg-neutral-100 text-foreground' : 'text-muted-foreground',
                )}
              >
                {x.label}
                <span className="font-mono text-[11px] opacity-70">{x.n}</span>
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 grow overflow-y-auto border-t" role="tabpanel">
          {loading ? (
            <SkeletonRegion label={t('loading')} className="px-3.5 py-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col gap-1.5 py-2">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-3 w-11/12" />
                </div>
              ))}
            </SkeletonRegion>
          ) : failed ? (
            <p className="px-5 py-8 text-center text-[13px] leading-[18px] text-muted-foreground">
              {t('error')}
            </p>
          ) : tab === 'updates' ? (
            updates.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] leading-[18px] text-muted-foreground">
                {t('empty')}
              </p>
            ) : (
              updates.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => void openUpdate(n)}
                  className={cn(
                    'flex w-full gap-2.5 border-b px-3.5 py-2.5 text-start outline-none last:border-0 hover:bg-accent focus-visible:bg-accent',
                    !n.readAt && 'bg-accent/40',
                  )}
                >
                  <span
                    className={cn(
                      'mt-1.5 size-1.5 shrink-0 rounded-full bg-status-critical',
                      n.readAt && 'opacity-0',
                    )}
                    aria-hidden
                  />
                  <span className="flex min-w-0 grow flex-col gap-0.5">
                    <span className="text-[13px] leading-[18px] font-medium text-pretty">
                      <bdi>{locale === 'ar' ? n.title.ar : n.title.en}</bdi>
                    </span>
                    <span className="text-xs leading-4 text-pretty text-muted-foreground">
                      <bdi>{locale === 'ar' ? n.body.ar : n.body.en}</bdi>
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] leading-[18px] whitespace-nowrap text-muted-foreground">
                    {relativeTime(n.createdAt, locale, t('justNow'))}
                  </span>
                  {!n.readAt && <span className="sr-only">{tc('unread')}</span>}
                </button>
              ))
            )
          ) : groups.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] leading-[18px] text-pretty text-muted-foreground">
              {tc(`empty.${tab}`)}
            </p>
          ) : (
            groups.map((g) => (
              <section key={g.stage} aria-label={tc(`stage.${g.stage}`)}>
                <div className="flex items-center gap-[7px] bg-neutral-50 px-3.5 py-2">
                  <span
                    className={cn('size-1.5 shrink-0 rounded-full', STAGE_DOT[g.stage])}
                    aria-hidden
                  />
                  <h3 className="grow text-[11px] leading-[15px] font-medium text-muted-foreground uppercase ltr:tracking-[0.04em]">
                    {tc(`stage.${g.stage}`)}
                  </h3>
                  <span className="font-mono text-[11px] leading-[15px] text-muted-foreground">
                    {g.all.length}
                  </span>
                </div>
                {g.all.slice(0, PER_STAGE).map((i) => {
                  const subject = subjectOf(i);
                  return (
                    <button
                      key={i.key}
                      type="button"
                      onClick={() => void openItem(i)}
                      className={cn(
                        'flex w-full gap-2.5 border-t border-s-2 px-3.5 py-[11px] text-start outline-none hover:bg-accent focus-visible:bg-accent',
                        STAGE_EDGE[g.stage],
                      )}
                    >
                      <span
                        className={cn(
                          'mt-1.5 size-1.5 shrink-0 rounded-full bg-status-critical',
                          i.read && 'opacity-0',
                        )}
                        aria-hidden
                      />
                      <span className="flex min-w-0 grow flex-col gap-0.5">
                        <span className="text-[13px] leading-[18px] font-medium text-pretty">
                          <bdi>{titleOf(i)}</bdi>
                        </span>
                        {subject && (
                          <span className="truncate text-xs leading-4">
                            <bdi>{subject}</bdi>
                          </span>
                        )}
                        <span className="truncate text-[11px] leading-[15px] text-muted-foreground">
                          <bdi>{metaOf(i)}</bdi>
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-[3px]">
                        <span
                          className={cn(
                            'inline-flex h-5 items-center rounded-full px-2 font-mono text-[11px] leading-5 whitespace-nowrap',
                            chipClass(i.daysLeft),
                          )}
                        >
                          {i.daysLeft < 0
                            ? tp('over', { n: Math.abs(i.daysLeft) })
                            : tp('left', { n: i.daysLeft })}
                        </span>
                        <span className="font-mono text-[10px] leading-[14px] whitespace-nowrap text-neutral-400">
                          {date(i.dueOn)}
                        </span>
                      </span>
                      {!i.read && <span className="sr-only">{tc('unread')}</span>}
                    </button>
                  );
                })}
                {g.all.length > PER_STAGE && (
                  <p className="border-t px-3.5 py-2 text-[11px] leading-[15px] text-muted-foreground">
                    <span>
                      <bdi>{tc('more', { count: g.all.length - PER_STAGE })}</bdi>
                    </span>
                  </p>
                )}
              </section>
            ))
          )}
        </div>

        {hasLadder && tab !== 'updates' && ladder && (
          <div className="flex items-center gap-2.5 border-t bg-neutral-50 px-3.5 py-2.5">
            <p className="min-w-0 grow text-[11px] leading-[15px] text-pretty text-muted-foreground">
              {ladder.suppressed > 0 && (
                <span>
                  <bdi>{tc('quiet', { count: ladder.suppressed })}</bdi>
                </span>
              )}
            </p>
            <Button
              variant="outline"
              size="xs"
              className="shrink-0"
              onClick={() => {
                setOpen(false);
                setRulesOpen(true);
              }}
            >
              {tc('rules')}
            </Button>
          </div>
        )}
      </PopoverContent>
      {ladder && (
        <EscalationRulesDialog
          open={rulesOpen}
          onOpenChange={setRulesOpen}
          thresholds={ladder.thresholds}
          // The thresholds move what the ladder shows: work it out again.
          onSaved={() => void Promise.all([load(), refreshCount()])}
        />
      )}
    </Popover>
  );
}
