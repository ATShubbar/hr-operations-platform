'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { LeaveBalanceListResponse } from '@hr/contracts';
import { matchesAnyField } from '@hr/text';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/lib/employee-format';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

type Row = LeaveBalanceListResponse['balances'][number];

const GRID = 'grid grid-cols-[1.6fr_1fr_92px_84px_84px_84px_104px]';
const HEAD = 'bg-neutral-100 py-2 text-xs leading-4 font-medium text-muted-foreground';
const CELL = 'flex h-12 items-center border-t';
const NUM = 'justify-end px-3 font-mono text-xs tabular-nums';

// Leaves → Balances (LEAVE-05) — the prototype's "Annual leave balances" table.
// One row per person still employed: staff see everyone, a client manager their
// own company (the server decides — GET /leave/balances on the caller's path).
// For staff a row opens the person's record on its Leave tab; client managers
// have no staff person record, so their rows are not links.
//
// Added over the prototype: a search box (its 40-row slice had none; ours lists
// everyone), folding Arabic the same way as every other list.
export function BalancesTab({
  rows,
  loading,
  clientName,
  linkRows,
}: {
  rows: Row[];
  loading: boolean;
  clientName: (id: string) => string | null;
  linkRows: boolean;
}) {
  const t = useTranslations('leaves.bal');
  const locale = useLocale() as Locale;
  const [search, setSearch] = useState('');
  const name = (r: Row) => (locale === 'ar' ? r.employee.nameAr : r.employee.nameEn);

  const shown = useMemo(
    () =>
      rows
        .filter((r) =>
          matchesAnyField([r.employee.nameEn, r.employee.nameAr, clientName(r.employee.clientId) ?? ''], search),
        )
        .sort((a, b) => name(a).localeCompare(name(b), locale)),
    [rows, search, locale],
  );

  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 grow flex-col gap-0.5">
          <h2 className="text-base leading-6 font-medium">{t('title')}</h2>
          <p className="text-[13px] leading-[18px] text-pretty text-muted-foreground">{t('note')}</p>
        </div>
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('search')}
          aria-label={t('search')}
          className="h-8 w-full shrink-0 text-sm sm:w-56"
        />
      </div>

      {/* The table needs ~640px; below that it scrolls inside its card, and the
          scroll region is a tab stop (UX-11: 2.1.1). */}
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t('title')}>
        <div className="min-w-[640px]">
          <div className={cn(GRID, 'border-t')}>
            <span className={cn(HEAD, 'px-5')}>{t('employee')}</span>
            <span className={cn(HEAD, 'px-3')}>{t('client')}</span>
            <span className={cn(HEAD, 'px-3 text-end')}>{t('accrued')}</span>
            <span className={cn(HEAD, 'px-3 text-end')}>{t('carried')}</span>
            <span className={cn(HEAD, 'px-3 text-end')}>{t('taken')}</span>
            <span className={cn(HEAD, 'px-3 text-end')}>{t('booked')}</span>
            <span className={cn(HEAD, 'px-5 text-end')}>{t('available')}</span>
          </div>

          {loading &&
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="border-t px-5 py-4">
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          {!loading && shown.length === 0 && (
            <p className="border-t px-5 py-6 text-center text-[13px] text-neutral-400">
              {rows.length === 0 ? t('none') : t('noMatch')}
            </p>
          )}

          {shown.map((r) => {
            const b = r.balance;
            const total = Math.max(1, b.accrued + b.carried);
            const pct = b.overdrawn ? 100 : Math.round((Math.max(0, b.available) / total) * 100);
            const cells = (
              <>
                <span className={cn(CELL, 'min-w-0 gap-2.5 px-5')}>
                  <Avatar name={name(r)} size="sm" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[13px] leading-[17px] font-medium">{name(r)}</span>
                    <span className="truncate text-[11px] leading-[15px] text-muted-foreground">
                      {t('perYear', { days: b.entitlement })}
                    </span>
                  </span>
                </span>
                <span className={cn(CELL, 'min-w-0 px-3 text-xs leading-4 text-muted-foreground')}>
                  <span className="truncate">{clientName(r.employee.clientId) ?? ''}</span>
                </span>
                <span className={cn(CELL, NUM)}>{b.accrued}</span>
                <span className={cn(CELL, NUM, 'text-muted-foreground')}>{b.carried}</span>
                <span className={cn(CELL, NUM)}>{b.taken}</span>
                <span className={cn(CELL, NUM)}>{b.booked}</span>
                <span className={cn(CELL, 'justify-end gap-2 px-5')}>
                  <span className="block h-1.5 w-11 overflow-hidden rounded-full bg-neutral-100">
                    <span
                      className={cn(
                        'block h-1.5 rounded-full',
                        b.overdrawn ? 'bg-status-critical' : 'bg-neutral-900',
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span
                    className={cn(
                      'min-w-[22px] text-end font-mono text-[13px] tabular-nums',
                      b.overdrawn && 'text-status-critical',
                    )}
                  >
                    {b.available}
                  </span>
                </span>
              </>
            );
            return linkRows ? (
              <Link
                key={r.employee.id}
                href={`/employees/${r.employee.id}?tab=leave`}
                className={cn(GRID, 'transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/60')}
              >
                {cells}
              </Link>
            ) : (
              <div key={r.employee.id} className={GRID}>
                {cells}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
