'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { CalendarItem } from '@hr/contracts';
import { formatHijri } from '@hr/dates';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  KIND_CHIP,
  KIND_DOT,
  dayKey,
  hijriDay,
  longDate,
  monthOf,
  timeOf,
  weekdayShort,
  type Iso,
} from './cal-utils';

// The calendar's three views + the selected-day panel (DS-14), the prototype's
// Month / Week / Agenda. Each receives the already-filtered items; opening an
// item is the page's job (an event → its editor, a deadline → its home).

export interface ViewProps {
  items: readonly CalendarItem[];
  title: (item: CalendarItem) => string;
  /** The owner's display name, for "owner · …" lines and avatars. */
  ownerName: (item: CalendarItem) => string | null;
  /** A short "where" line: the client, or the status for a deadline. */
  where: (item: CalendarItem) => string | null;
  onOpen: (item: CalendarItem) => void;
}

const byDay = (items: readonly CalendarItem[]) => {
  const map = new Map<Iso, CalendarItem[]>();
  for (const it of items) {
    const k = dayKey(it);
    map.set(k, [...(map.get(k) ?? []), it]);
  }
  return map;
};

/** One item as a clickable chip (month cell, week column, agenda row). */
function Chip({
  item,
  label,
  size,
  sub,
  onOpen,
}: {
  item: CalendarItem;
  label: string;
  size: 'cell' | 'week' | 'agenda';
  sub?: string | null;
  onOpen: (item: CalendarItem) => void;
}) {
  const time = timeOf(item);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(item);
      }}
      className={cn(
        'flex w-full min-w-0 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring',
        KIND_CHIP[item.kind],
        size === 'cell' && 'h-[19px] items-center gap-1 rounded-sm px-1.5',
        size === 'week' && 'flex-col gap-0.5 rounded-md p-2',
        size === 'agenda' && 'items-center gap-3 rounded-md px-2.5 py-2',
      )}
    >
      {size === 'cell' && (
        <>
          {time && (
            <span className="shrink-0 font-mono text-[10px] leading-[19px] opacity-75">{time}</span>
          )}
          <span className="min-w-0 grow truncate text-[11px] leading-[19px] font-medium">
            {label}
          </span>
        </>
      )}
      {size === 'week' && (
        <>
          {time && <span className="font-mono text-[10px] leading-[14px] opacity-75">{time}</span>}
          <span className="text-xs leading-4 font-medium text-pretty">{label}</span>
          {sub && <span className="text-[10px] leading-[14px] opacity-70">{sub}</span>}
        </>
      )}
      {size === 'agenda' && (
        <>
          <span className="w-11 shrink-0 font-mono text-[11px] leading-4 opacity-75">{time}</span>
          <span className="min-w-0 grow truncate text-[13px] leading-[18px] font-medium">
            {label}
          </span>
          {sub && (
            <span className="hidden shrink-0 text-[11px] leading-4 opacity-70 sm:inline">
              {sub}
            </span>
          )}
        </>
      )}
    </button>
  );
}

export function MonthView({
  items,
  title,
  onOpen,
  days,
  anchor,
  today,
  selected,
  onSelect,
}: ViewProps & {
  days: readonly Iso[];
  anchor: Iso;
  today: Iso;
  selected: Iso;
  onSelect: (day: Iso) => void;
}) {
  const t = useTranslations('calendar');
  const locale = useLocale();
  const map = byDay(items);
  const SHOWN = 3;
  return (
    <div role="group" aria-label={t('monthGrid')} className="grid grid-cols-7 border-t">
      {/* Weekday names are visual only: every day button is labelled with its full
          date (a grid role would need real rows, which this layout does not have). */}
      <div aria-hidden className="contents">
        {days.slice(0, 7).map((d) => (
          <span
            key={d}
            className="min-w-0 truncate bg-neutral-100 px-2.5 py-2 text-xs leading-4 font-medium text-muted-foreground sm:px-2.5"
          >
            <span className="hidden sm:inline">{weekdayShort(d, locale)}</span>
            <span className="sm:hidden">{weekdayShort(d, locale, 'narrow')}</span>
          </span>
        ))}
      </div>
      {days.map((d) => {
        const its = map.get(d) ?? [];
        const inMonth = monthOf(d) === monthOf(anchor);
        const isToday = d === today;
        const isSel = d === selected;
        return (
          <div
            key={d}
            onClick={() => onSelect(d)}
            className={cn(
              'flex min-h-[72px] min-w-0 cursor-pointer flex-col gap-1 border-t border-s p-1 sm:min-h-[122px] sm:p-1.5',
              isSel ? 'bg-neutral-50' : 'bg-card',
              !inMonth && 'text-neutral-400',
            )}
          >
            <span className="flex items-center gap-1.5">
              {/* The day number is the real control (keyboard + AT); the cell's
                  own click is the mouse convenience the prototype has. */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(d);
                }}
                aria-label={longDate(d, locale)}
                aria-pressed={isSel}
                className={cn(
                  'inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1 text-[13px] leading-[22px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isToday && 'bg-neutral-900 text-white',
                )}
              >
                {Number(d.slice(8))}
              </button>
              <span className="hidden grow sm:block" />
              <span className="hidden text-[10px] leading-[14px] text-neutral-400 sm:inline">
                {hijriDay(d)}
              </span>
            </span>
            {/* Phones get a dot per item; the chips need ~120px a column. */}
            {its.length > 0 && (
              <span
                className="flex flex-wrap gap-0.5 sm:hidden"
                aria-label={t('itemsCount', { count: its.length })}
              >
                {its.slice(0, 4).map((it) => (
                  <span
                    key={`${it.kind}-${it.id}`}
                    className={cn('size-1.5 rounded-full', KIND_DOT[it.kind])}
                  />
                ))}
              </span>
            )}
            <span className="hidden flex-col gap-1 sm:flex">
              {its.slice(0, SHOWN).map((it) => (
                <Chip
                  key={`${it.kind}-${it.id}`}
                  item={it}
                  label={title(it)}
                  size="cell"
                  onOpen={onOpen}
                />
              ))}
              {its.length > SHOWN && (
                <span className="px-1.5 text-[11px] leading-4 text-muted-foreground">
                  {t('more', { count: its.length - SHOWN })}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function WeekView({
  items,
  title,
  ownerName,
  where,
  onOpen,
  days,
  today,
}: ViewProps & { days: readonly Iso[]; today: Iso }) {
  const t = useTranslations('calendar');
  const locale = useLocale();
  const map = byDay(items);
  return (
    <div
      role="region"
      aria-label={t('weekGrid')}
      tabIndex={0}
      className="overflow-x-auto border-t focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div className="grid min-w-[840px] grid-cols-7">
        {days.map((d) => {
          const its = map.get(d) ?? [];
          const isToday = d === today;
          return (
            <section key={d} aria-label={longDate(d, locale)} className="flex flex-col border-s">
              <div
                className={cn(
                  'flex items-baseline gap-1.5 px-2.5 py-2',
                  isToday ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-muted-foreground',
                )}
              >
                <span className="text-xs leading-4 font-medium">
                  {weekdayShort(d, locale)} {Number(d.slice(8))}
                </span>
                <span className="text-[10px] leading-[14px] opacity-70">{hijriDay(d)}</span>
              </div>
              <div className="flex min-h-[420px] flex-col gap-1.5 p-2">
                {its.map((it) => (
                  <Chip
                    key={`${it.kind}-${it.id}`}
                    item={it}
                    label={title(it)}
                    size="week"
                    sub={[ownerName(it), where(it)].filter(Boolean).join(' · ')}
                    onOpen={onOpen}
                  />
                ))}
                {its.length === 0 && (
                  <span className="px-0.5 py-2 text-[11px] leading-[15px] text-neutral-300">
                    {t('nothingBooked')}
                  </span>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function AgendaView({
  items,
  title,
  ownerName,
  where,
  onOpen,
  today,
}: ViewProps & { today: Iso }) {
  const t = useTranslations('calendar');
  const locale = useLocale() as 'ar' | 'en';
  const groups = [...byDay(items).entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (groups.length === 0) {
    return (
      <p className="border-t px-6 py-14 text-center text-sm leading-5 text-muted-foreground">
        {t('agendaEmpty')}
      </p>
    );
  }
  return (
    <div className="border-t">
      {groups.map(([d, its]) => (
        <section
          key={d}
          aria-labelledby={`ag-${d}`}
          className="flex flex-col gap-3 px-4 py-3.5 shadow-[inset_0_-1px_0_var(--border)] sm:flex-row sm:gap-4"
        >
          <div className="flex shrink-0 flex-col items-start gap-0.5 sm:w-[150px]">
            <h3
              id={`ag-${d}`}
              className={cn(
                'inline-flex h-[22px] items-center rounded-full px-2 text-xs leading-[22px] font-medium',
                d === today ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-800',
              )}
            >
              {longDate(d, locale)}
            </h3>
            <span className="text-[11px] leading-[15px] text-muted-foreground">
              {formatHijri(new Date(`${d}T12:00:00Z`), locale)}
            </span>
          </div>
          <div className="flex min-w-0 grow flex-col gap-1.5">
            {its.map((it) => (
              <div key={`${it.kind}-${it.id}`} className="flex min-w-0 items-center gap-2">
                <div className="min-w-0 grow">
                  <Chip item={it} label={title(it)} size="agenda" sub={where(it)} onOpen={onOpen} />
                </div>
                {ownerName(it) && <Avatar name={ownerName(it)} size="xs" />}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function DayPanel({
  items,
  title,
  ownerName,
  where,
  onOpen,
  day,
  canCreate,
  onSchedule,
}: ViewProps & { day: Iso; canCreate: boolean; onSchedule: () => void }) {
  const t = useTranslations('calendar');
  const locale = useLocale() as 'ar' | 'en';
  const its = byDay(items).get(day) ?? [];
  return (
    <section
      aria-labelledby="day-panel"
      className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
        <div className="flex min-w-0 grow flex-col gap-px">
          <h2 id="day-panel" className="text-base leading-6 font-medium">
            {longDate(day, locale)}
          </h2>
          <span className="text-xs leading-4 text-muted-foreground">
            {formatHijri(new Date(`${day}T12:00:00Z`), locale)}
          </span>
        </div>
        {canCreate && (
          <Button variant="outline" size="sm" onClick={onSchedule}>
            {t('scheduleOnDay')}
          </Button>
        )}
      </div>
      {its.length === 0 ? (
        <p className="border-t px-4 py-7 text-sm leading-5 text-muted-foreground">
          {t('dayEmpty')}
        </p>
      ) : (
        <ul>
          {its.map((it) => (
            <li key={`${it.kind}-${it.id}`} className="border-t">
              <button
                type="button"
                onClick={() => onOpen(it)}
                className="flex w-full items-center gap-3.5 px-4 py-3 text-start transition-colors outline-none hover:bg-neutral-50 focus-visible:bg-neutral-50"
              >
                <span className="w-12 shrink-0 font-mono text-xs leading-4 text-neutral-500">
                  {timeOf(it) || t('allDay')}
                </span>
                <span
                  className={cn(
                    'inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] leading-5',
                    KIND_CHIP[it.kind],
                  )}
                >
                  {t(`kind.${it.kind}`)}
                </span>
                <span className="flex min-w-0 grow flex-col">
                  <span className="truncate text-sm leading-[19px] font-medium">{title(it)}</span>
                  <span className="truncate text-xs leading-4 text-muted-foreground">
                    {[ownerName(it), where(it)].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
