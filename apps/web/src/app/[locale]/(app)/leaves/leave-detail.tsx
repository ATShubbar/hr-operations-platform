'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Clock, Scale, TriangleAlert } from 'lucide-react';
import type { LeaveBalanceListResponse, LeaveResponse, LeaveType } from '@hr/contracts';
import { formatHijri } from '@hr/dates';
import type { Locale } from '@/lib/employee-format';
import { deductsBalance, leaveDate } from '@/lib/leave';
import { toneFor } from '@/lib/status-tone';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';

// One leave request's detail (LEAVE-04; extracted in LEAVE-06 so My leave reuses
// it): the prototype's header, length / dates (Gregorian + Hijri) / submitted,
// the details, a wait line written for its reader, the basis, the annual-balance
// block, the clash list, and whichever actions the caller is allowed.

export function LeaveDetail({
  lq,
  name,
  company,
  audience,
  balance,
  clashes,
  can,
  acting,
  actError,
  onAct,
}: {
  lq: LeaveResponse;
  name: string;
  company: string | null;
  // Who is reading: the wait line and the on-behalf note depend on it.
  audience: 'staff' | 'client' | 'employee';
  balance: LeaveBalanceListResponse['balances'][number]['balance'] | null;
  clashes: { id: string; name: string; type: string; window: string }[];
  can: { decide: boolean; file: boolean; withdraw: boolean };
  acting: boolean;
  actError: string;
  onAct: (verb: 'approve' | 'decline' | 'file' | 'withdraw') => void;
}) {
  const t = useTranslations('leaves');
  const locale = useLocale() as Locale;
  const isStaff = audience === 'staff';
  const longDay = (ymd: string) =>
    new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(leaveDate(ymd));
  const type = lq.type as LeaveType;
  const employer = company ?? t('wait.theEmployer');
  const waitLine =
    lq.status === 'pending'
      ? audience === 'staff'
        ? t('wait.pendingStaff', { client: employer })
        : audience === 'client'
          ? t('wait.pendingClient')
          : t('wait.pendingEmployee')
      : lq.status === 'approved'
        ? isStaff
          ? t('wait.approvedStaff', { client: employer })
          : t('wait.approvedClient')
        : t(`wait.${lq.status}`);

  const showBalance = deductsBalance(type) && balance !== null && lq.status !== 'declined' && lq.status !== 'withdrawn';
  const short = showBalance && lq.status !== 'filed' && lq.days > balance!.available;

  return (
    <>
      <div className="flex flex-wrap items-start gap-3.5 p-5">
        <Avatar name={name} size="lg" />
        <div className="flex min-w-0 grow flex-col gap-[3px]">
          <div className="flex flex-wrap items-center gap-x-2.5">
            <h2 className="text-xl leading-7 font-semibold tracking-[-0.01em]">{t(`type.${type}`)}</h2>
            <bdi dir="ltr" className="font-mono text-xs text-neutral-400">
              {lq.ref}
            </bdi>
          </div>
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {name}
            {company ? ` · ${company}` : ''}
          </span>
        </div>
        <StatusPill tone={toneFor('leave', lq.status)}>{t(`status.${lq.status}`)}</StatusPill>
      </div>

      <dl className="grid grid-cols-1 border-y sm:grid-cols-3">
        <div className="flex flex-col gap-0.5 px-5 py-3">
          <dt className="text-xs leading-4 text-muted-foreground">{t('length')}</dt>
          <dd className="text-sm leading-5">{t('daysCount', { count: lq.days })}</dd>
          <dd className="text-[11px] leading-[15px] text-neutral-400">{t(`pay.${type}`)}</dd>
        </div>
        <div className="flex flex-col gap-0.5 border-t px-5 py-3 sm:border-s sm:border-t-0">
          <dt className="text-xs leading-4 text-muted-foreground">{t('dates')}</dt>
          <dd className="text-sm leading-5">
            {longDay(lq.startDate)} — {longDay(lq.endDate)}
          </dd>
          <dd className="text-[11px] leading-[15px] text-neutral-400">
            {formatHijri(leaveDate(lq.startDate), locale)} — {formatHijri(leaveDate(lq.endDate), locale)}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5 border-t px-5 py-3 sm:border-s sm:border-t-0">
          <dt className="text-xs leading-4 text-muted-foreground">{t('submitted')}</dt>
          <dd className="text-sm leading-5">{longDay(lq.createdAt.slice(0, 10))}</dd>
          <dd className="text-[11px] leading-[15px] text-neutral-400">
            {t('serviceLevel')} · {t('soon')}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-4 p-5">
        <p className="text-sm leading-[22px] text-pretty text-neutral-700">{lq.details ?? t('noDetail')}</p>

        <div className="flex items-center gap-2.5 rounded-md bg-neutral-50 px-[13px] py-[11px] ring-1 ring-foreground/10">
          <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="grow text-[13px] leading-[18px] text-pretty text-neutral-700">{waitLine}</span>
          {can.withdraw && (
            <Button variant="ghost" size="sm" disabled={acting} onClick={() => onAct('withdraw')} className="shrink-0">
              {t('withdraw')}
            </Button>
          )}
        </div>

        <p className="flex items-start gap-[9px] text-xs leading-[17px] text-pretty text-muted-foreground">
          <Scale className="mt-px size-3.5 shrink-0" aria-hidden />
          {t(`basis.${type}`)}
        </p>

        {showBalance && (
          <div className="flex flex-col gap-2.5 rounded-md bg-neutral-50 p-3.5 ring-1 ring-foreground/10">
            <div className="flex items-baseline gap-2.5">
              <span className="grow text-[13px] leading-[18px] font-medium">{t('annualBalance')}</span>
              <span className="text-xs leading-4 text-muted-foreground tabular-nums">
                {t('balanceLine', {
                  available: balance!.available,
                  total: balance!.accrued + balance!.carried,
                })}
              </span>
            </div>
            <span className="text-xs leading-4 text-muted-foreground">
              {lq.status === 'filed'
                ? t('afterFiled')
                : t('afterLine', { left: balance!.available - lq.days })}
            </span>
            {short && (
              <span className="flex items-center gap-2 rounded-md bg-[rgba(217,119,6,0.1)] px-2.5 py-2 text-status-warning">
                <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                <span className="text-xs leading-4">
                  {t('shortNote', { excess: lq.days - balance!.available })}
                </span>
              </span>
            )}
          </div>
        )}

        {clashes.length > 0 && (
          <div className="flex flex-col gap-2 rounded-md bg-[rgba(217,119,6,0.1)] p-3.5">
            <span className="flex items-center gap-2 text-status-warning">
              <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
              <span className="text-[13px] leading-[18px] font-medium">
                {t('clashNote', { count: clashes.length, client: employer })}
              </span>
            </span>
            {clashes.map((c) => (
              <span key={c.id} className="flex items-baseline gap-2.5 text-xs leading-[17px]">
                <span className="min-w-0 grow truncate text-neutral-700">{c.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {c.type} · {c.window}
                </span>
              </span>
            ))}
          </div>
        )}

        {can.decide && (
          <div className="flex flex-wrap items-center gap-2">
            {isStaff && (
              <span className="min-w-0 grow text-xs leading-4 text-pretty text-muted-foreground">{t('onBehalf')}</span>
            )}
            <Button size="sm" disabled={acting} onClick={() => onAct('approve')} className={cn(!isStaff && 'ms-auto')}>
              {t('approve')}
            </Button>
            <Button size="sm" variant="outline" disabled={acting} onClick={() => onAct('decline')}>
              {t('decline')}
            </Button>
          </div>
        )}

        {can.file && (
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="min-w-0 grow text-xs leading-4 text-pretty text-muted-foreground">{t('fileNote')}</span>
            <Button size="sm" disabled={acting} onClick={() => onAct('file')} className="shrink-0">
              {t('file')}
            </Button>
          </div>
        )}

        {actError && <p className="text-sm text-destructive">{actError}</p>}
      </div>
    </>
  );
}
