'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { EmployeeLeaveResponse, LeaveType } from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import type { Locale } from '@/lib/employee-format';
import { leaveDate } from '@/lib/leave';
import { useCan } from '@/lib/session';
import { cn } from '@/lib/utils';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/load-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { toastSuccess } from '@/components/ui/toast';
import { RequestLeaveDialog } from '../../leaves/request-leave-dialog';

// The Person record's Leave tab (LEAVE-05) — the prototype's: the annual balance
// (available, the Art. 109 basis, a taken / booked / remaining bar, overdrawn),
// four figures (accrued, carried, sick, unpaid), what is still awaiting a
// decision, and the leave history. Over GET /leave/balances/:employeeId — the
// same calculation the Leaves screen's Balances tab shows.
//
// History lists every filed spell, newest first, across years; a spell crossing
// 31 December appears as its two parts under one reference (owner decision —
// split by day).
export function LeaveTab({
  employeeId,
  terminated,
  endpoint,
}: {
  employeeId: string;
  terminated: boolean;
  // Where the balance comes from: staff/client managers read
  // /leave/balances/:id; an employee reads their own /me/leave/balance (LEAVE-06).
  endpoint?: string;
}) {
  const t = useTranslations('leaves');
  const tp = useTranslations('leaves.person');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const canCreate = useCan('leave.create');
  const [data, setData] = useState<EmployeeLeaveResponse | null>(null);
  const [error, setError] = useState('');
  const [newOpen, setNewOpen] = useState(false);

  async function load() {
    setError('');
    try {
      setData(await apiFetch<EmployeeLeaveResponse>(endpoint ?? `/leave/balances/${employeeId}`));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(tp('error'));
    }
  }

  useEffect(() => {
    void load();
  }, [employeeId, endpoint]);

  if (error) return <LoadError message={error} onRetry={() => void load()} hasContent={false} />;
  if (!data) {
    return (
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const b = data.balance;
  const total = Math.max(1, b.accrued + b.carried);
  const pct = (n: number) => `${Math.round((Math.max(0, Math.min(n, total)) / total) * 100)}%`;
  const takenTone = b.overdrawn ? 'bg-status-critical' : 'bg-neutral-900';
  const day = (ymd: string) =>
    new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(leaveDate(ymd));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3.5 rounded-xl bg-card px-5 py-[18px] ring-1 ring-foreground/10">
        <div className="flex items-start gap-4">
          <div className="flex min-w-0 grow flex-col gap-0.5">
            <h2 className="text-base leading-6 font-medium">{tp('title')}</h2>
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              {b.entitlement === 30 ? tp('basis30') : tp('basis21')}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <span
              className={cn(
                'text-[30px] leading-9 font-semibold tracking-[-0.02em] tabular-nums',
                b.overdrawn && 'text-status-critical',
              )}
            >
              {b.available}
            </span>
            <span className="text-[11px] leading-[15px] text-muted-foreground">{tp('daysAvailable')}</span>
          </div>
        </div>

        <div className="flex h-2.5 overflow-hidden rounded-full bg-neutral-100" aria-hidden>
          <span className={cn('block h-2.5', takenTone)} style={{ width: pct(b.taken) }} />
          <span className="block h-2.5 bg-neutral-400" style={{ width: pct(b.booked) }} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] leading-[15px] text-muted-foreground">
          <span className="inline-flex items-center gap-[5px]">
            <span className={cn('size-2 rounded-[2px]', takenTone)} />
            {tp('takenLegend', { n: b.taken })}
          </span>
          <span className="inline-flex items-center gap-[5px]">
            <span className="size-2 rounded-[2px] bg-neutral-400" />
            {tp('bookedLegend', { n: b.booked })}
          </span>
          <span className="inline-flex items-center gap-[5px]">
            <span className="size-2 rounded-[2px] bg-neutral-100 ring-1 ring-foreground/10" />
            {tp('remainingLegend', { n: b.available })}
          </span>
        </div>

        {b.overdrawn && (
          <p className="flex items-center gap-2 rounded-md bg-[rgba(220,38,38,0.1)] px-3 py-2.5 text-xs leading-4 text-status-critical">
            <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
            {tp('overdrawn', { n: Math.abs(b.available) })}
          </p>
        )}

        <dl className="grid grid-cols-2 gap-3 border-t pt-3.5 sm:grid-cols-4">
          {(
            [
              ['accrued', b.accrued],
              ['carried', b.carried],
              ['sick', b.sick],
              ['unpaid', b.unpaid],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex flex-col gap-px">
              <dt className="text-[11px] leading-[15px] text-muted-foreground">{tp(k)}</dt>
              <dd className="font-mono text-base leading-[22px] tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[11px] leading-[15px] text-neutral-400">
          {b.carried
            ? tp('carriedNote', { n: b.carried, year: b.year - 1 })
            : tp('nothingCarried', { year: b.year - 1 })}
        </p>
        {b.pending > 0 && (
          <p className="flex items-center gap-2 rounded-md bg-[rgba(217,119,6,0.1)] px-3 py-2.5 text-xs leading-4 text-status-warning">
            <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
            {tp('pending', { n: b.pending })}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="flex items-center gap-3 px-5 py-4">
          <h2 className="grow text-base leading-6 font-medium">{tp('history')}</h2>
          {canCreate && !terminated && (
            <Button size="sm" variant="outline" onClick={() => setNewOpen(true)}>
              {t('request')}
            </Button>
          )}
        </div>
        {data.history.length === 0 ? (
          <p className="border-t px-5 py-6 text-center text-[13px] leading-[18px] text-neutral-400">
            {tp('noHistory')}
          </p>
        ) : (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={tp('history')}>
            <ul className="min-w-[520px]">
              {data.history.map((h, i) => (
                <li
                  key={`${h.ref ?? 'x'}-${h.leaveYear}-${i}`}
                  className="grid h-[46px] grid-cols-[1.2fr_90px_1.2fr_80px_88px] items-center border-t"
                >
                  <span className="flex min-w-0 items-baseline gap-2 px-5 text-[13px] leading-[18px]">
                    <span className="truncate">{t(`type.${h.type as LeaveType}`)}</span>
                    {h.ref && (
                      <bdi dir="ltr" className="shrink-0 font-mono text-[11px] text-neutral-400">
                        {h.ref}
                      </bdi>
                    )}
                  </span>
                  <span className="px-3 font-mono text-xs tabular-nums">{t('daysCount', { count: h.days })}</span>
                  <span className="px-3 text-xs leading-4 text-muted-foreground">
                    {day(h.startDate)} — {day(h.endDate)}
                  </span>
                  <span className="px-3 text-[11px] text-neutral-400">
                    {h.type === 'unpaid' ? tp('unpaidLabel') : tp('paid')}
                  </span>
                  <span className="flex justify-end px-5">
                    <StatusPill tone={h.state === 'taken' ? 'neutral' : 'info'}>
                      {h.state === 'taken' ? tp('taken') : tp('bookedState')}
                    </StatusPill>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <RequestLeaveDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        people={[{ employee: data.employee, balance: data.balance }]}
        preselect={data.employee.id}
        onSubmitted={(row) => {
          setNewOpen(false);
          toastSuccess(t('dialog.submitted', { ref: row.ref }));
          void load();
        }}
      />
    </div>
  );
}
