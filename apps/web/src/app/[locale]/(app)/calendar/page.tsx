'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type {
  CalendarEventResponse,
  CalendarItem,
  CalendarViewResponse,
  ClientListResponse,
  ClientResponse,
  StaffDirectoryEntry,
  StaffDirectoryResponse,
} from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { useViewItemLabels, type ViewItemKind } from '@/lib/view-item-labels';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LoadError, NoAccess } from '@/components/ui/load-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  KIND_CHIP,
  addDays,
  hijriSpan,
  monthGrid,
  monthTitle,
  shiftMonth,
  todayIso,
  weekOf,
  type Iso,
} from './cal-utils';
import { EventDialog, type EventTarget } from './event-dialog';
import { AgendaView, DayPanel, MonthView, WeekView } from './views';

// The Calendar (DS-14) — the prototype's calendar (ADR-012): Month (grid + the
// selected day's panel), Week and Agenda over /calendar/view, which merges booked
// events with the live deadlines of procedures, requests and tasks (CAL-02), each
// source gated by its own read permission.
//
// The person chips filter by whose item it is — /calendar/view now names each
// item's owner (DS-14 API addition: an event's owner, a deadline's assignee).
// The prototype's event TYPES (meeting / interview / portal appointment) need a
// stored type nothing has yet: events share one style and the legend says so.
//
// Opening an item: an event opens its editor (calendar.update holders); a deadline
// goes to where it is worked — procedures and tasks to the Work queue, a request
// to the Requests screen.

type View = 'month' | 'week' | 'agenda';
const VIEWS: readonly View[] = ['month', 'week', 'agenda'];
const ALL = 'all';
const ASSIGNABLE = new Set(['administrator', 'hr_officer', 'gro_officer']);
const LEGEND = ['gro', 'request', 'task', 'event'] as const;

export default function CalendarPage() {
  const t = useTranslations('calendar');
  const locale = useLocale();
  const router = useRouter();
  const { statusLabel, titleFor } = useViewItemLabels();
  const canCreate = useCan('calendar.create');
  const canUpdate = useCan('calendar.update');

  const today = todayIso();
  const [view, setView] = useState<View>('month');
  const [selected, setSelected] = useState<Iso>(today);
  const [owner, setOwner] = useState(ALL);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [staff, setStaff] = useState<StaffDirectoryEntry[]>([]);
  const [clients, setClients] = useState<ClientResponse[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [target, setTarget] = useState<EventTarget | null>(null);

  // The window each view shows.
  const days = useMemo<Iso[]>(
    () => (view === 'week' ? weekOf(selected) : monthGrid(selected)),
    [view, selected],
  );
  const range = useMemo(() => {
    const first = view === 'agenda' ? `${selected.slice(0, 7)}-01` : days[0]!;
    const last = view === 'agenda' ? addDays(shiftMonth(selected, 1), -1) : days[days.length - 1]!;
    return { first, last };
  }, [view, selected, days]);

  const load = useCallback(async () => {
    setError('');
    try {
      const qs = `?from=${range.first}T00:00:00.000Z&to=${range.last}T23:59:59.999Z`;
      const res = await apiFetch<CalendarViewResponse>(`/calendar/view${qs}`);
      setItems([...res.items].sort((a, b) => a.startAt.localeCompare(b.startAt)));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setError(t('error'));
    } finally {
      setLoaded(true);
    }
  }, [range, router, t]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    apiFetch<StaffDirectoryResponse>('/staff-users/directory')
      .then((r) => setStaff(r.users.filter((u) => ASSIGNABLE.has(u.role))))
      .catch(() => setStaff([]));
    apiFetch<ClientListResponse>('/clients')
      .then((r) => setClients(r.clients))
      .catch(() => setClients([]));
  }, []);

  const shown = owner === ALL ? items : items.filter((i) => i.ownerUserId === owner);

  const title = (it: CalendarItem) => titleFor(it.kind as ViewItemKind, it.title);
  const ownerName = (it: CalendarItem) =>
    staff.find((s) => s.id === it.ownerUserId)?.displayName ?? null;
  const where = (it: CalendarItem) => {
    const c = clients.find((x) => x.id === it.clientId);
    const client = c ? (locale === 'ar' ? c.name.ar : c.name.en) : null;
    if (it.kind === 'event') return client;
    return [statusLabel(it.kind as ViewItemKind, it.status), client].filter(Boolean).join(' · ');
  };

  async function open(it: CalendarItem) {
    if (it.kind === 'request') return void router.push(`/requests?r=${it.id}`);
    if (it.kind === 'task' || it.kind === 'gro') return void router.push('/queue');
    if (!canUpdate) return;
    try {
      const ev = await apiFetch<CalendarEventResponse>(`/calendar/events/${it.id}`);
      setTarget({ mode: 'edit', event: ev });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace('/login');
      else setError(t('error'));
    }
  }

  const step = (dir: -1 | 1) =>
    setSelected((s) =>
      view === 'week' ? addDays(s, 7 * dir) : `${shiftMonth(s, dir).slice(0, 7)}-01`,
    );

  const heading =
    view === 'week'
      ? `${t('weekOf')} ${new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${days[0]}T12:00:00Z`))}`
      : monthTitle(selected, locale);
  const hijri =
    view === 'week'
      ? hijriSpan(days[0]!, days[6]!, locale)
      : hijriSpan(`${selected.slice(0, 7)}-01`, addDays(shiftMonth(selected, 1), -1), locale);

  const viewProps = {
    items: shown,
    title,
    ownerName,
    where,
    onOpen: (i: CalendarItem) => void open(i),
  };

  if (forbidden) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <NoAccess capability="calendar.read" />
      </div>
    );
  }

  return (
    <div className="flex max-w-[1360px] flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        <div className="flex min-w-0 grow flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        {canCreate && (
          <Button
            size="sm"
            className="shrink-0 self-start sm:self-auto"
            onClick={() => setTarget({ mode: 'new', day: selected })}
          >
            {t('new')}
          </Button>
        )}
      </div>

      {error && (
        <LoadError message={error} onRetry={() => void load()} hasContent={items.length > 0} />
      )}

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
          <Button variant="outline" size="sm" onClick={() => setSelected(today)}>
            {t('today')}
          </Button>
          <span className="hidden grow lg:block" />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label={view === 'week' ? t('prevWeek') : t('prevMonth')}
              className="inline-flex size-7 items-center justify-center rounded-md text-neutral-700 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <div className="flex min-w-0 flex-col items-center sm:min-w-[200px]">
              <span
                className="text-lg leading-6 font-semibold tracking-[-0.01em]"
                aria-live="polite"
              >
                {heading}
              </span>
              <span className="text-[11px] leading-[15px] text-neutral-400">{hijri}</span>
            </div>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label={view === 'week' ? t('nextWeek') : t('nextMonth')}
              className="inline-flex size-7 items-center justify-center rounded-md text-neutral-700 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
          <span className="hidden grow lg:block" />
          <div
            role="group"
            aria-label={t('peopleFilter')}
            className="flex max-w-full shrink-0 gap-0.5 overflow-x-auto rounded-md bg-neutral-100 p-0.5"
          >
            {[
              { id: ALL, label: t('everyone') },
              ...staff.map((s) => ({
                id: s.id,
                label: (s.displayName ?? '').split(' ')[0] || s.id.slice(0, 8),
              })),
            ].map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={owner === o.id}
                onClick={() => setOwner(o.id)}
                className={cn(
                  'inline-flex h-6 shrink-0 items-center rounded-[6px] px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  owner === o.id
                    ? 'bg-neutral-900 text-neutral-50'
                    : 'text-neutral-700 hover:text-foreground',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <Select value={view} onValueChange={(v) => setView((v as View) ?? 'month')}>
            <SelectTrigger size="sm" className="w-[120px]" aria-label={t('viewLabel')}>
              <SelectValue>{(v) => t(`view.${String(v)}`)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {VIEWS.map((v) => (
                <SelectItem key={v} value={v}>
                  {t(`view.${v}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!loaded ? (
          <div className="border-t p-4" aria-busy="true">
            <Skeleton className="h-[420px] w-full rounded-lg" />
          </div>
        ) : view === 'month' ? (
          <MonthView
            {...viewProps}
            days={days}
            anchor={selected}
            today={today}
            selected={selected}
            onSelect={setSelected}
          />
        ) : view === 'week' ? (
          <WeekView {...viewProps} days={days} today={today} />
        ) : (
          <AgendaView {...viewProps} today={today} />
        )}

        <div className="flex flex-wrap items-center gap-3.5 border-t px-4 py-3">
          {LEGEND.map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={cn('size-3 rounded', KIND_CHIP[k])} />
              <span className="text-xs leading-4 text-muted-foreground">{t(`legend.${k}`)}</span>
            </span>
          ))}
          <span className="text-xs leading-4 text-neutral-400">{t('legendSoon')}</span>
        </div>
      </div>

      {view === 'month' && (
        <DayPanel
          {...viewProps}
          day={selected}
          canCreate={canCreate}
          onSchedule={() => setTarget({ mode: 'new', day: selected })}
        />
      )}

      <EventDialog target={target} onClose={() => setTarget(null)} onSaved={() => void load()} />
    </div>
  );
}
