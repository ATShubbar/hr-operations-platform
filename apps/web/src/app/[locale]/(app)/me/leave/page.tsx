'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { EmployeeLeaveResponse, LeaveListResponse, LeaveResponse } from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import type { Locale } from '@/lib/employee-format';
import { leaveDate } from '@/lib/leave';
import { useSession } from '@/lib/session';
import { toneFor } from '@/lib/status-tone';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError } from '@/components/ui/load-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs';
import { toastSuccess } from '@/components/ui/toast';
import { LeaveTab } from '../../employees/[id]/leave-tab';
import { LeaveDetail } from '../../leaves/leave-detail';
import { RequestLeaveDialog } from '../../leaves/request-leave-dialog';

// My leave (LEAVE-06, ADR-014) — the prototype's employee version of Leaves:
// "My leave", "N requests on file · M awaiting a decision", Request leave (always
// for oneself — no "who" picker, POST /me/leave), the Requests tab (every request
// ABOUT me, whoever raised it; Withdraw on a pending one I raised) and My balance
// (the same card + history as the Person record's Leave tab, over
// /me/leave/balance). Behind the per-company self-service switch, like My file.
const ORDER: Record<LeaveResponse['status'], number> = {
  pending: 0,
  approved: 1,
  filed: 2,
  declined: 3,
  withdrawn: 4,
};

export default function MyLeavePage() {
  const t = useTranslations('leaves');
  const tm = useTranslations('me');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const employeeId = useSession().employeeId ?? '';

  const [leave, setLeave] = useState<LeaveResponse[]>([]);
  const [mine, setMine] = useState<EmployeeLeaveResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'disabled' | 'error'>('loading');
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'requests' | 'balance'>('requests');
  const [newOpen, setNewOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const [actError, setActError] = useState('');

  async function load(keep?: string) {
    try {
      const [l, b] = await Promise.all([
        apiFetch<LeaveListResponse>('/me/leave'),
        apiFetch<EmployeeLeaveResponse>('/me/leave/balance'),
      ]);
      const rows = sorted(l.leave);
      setLeave(rows);
      setMine(b);
      setSelected((cur) => keep ?? cur ?? rows[0]?.id ?? null);
      setState('ready');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setState(err instanceof ApiError && err.status === 403 ? 'disabled' : 'error');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const lq = useMemo(() => leave.find((r) => r.id === selected) ?? null, [leave, selected]);
  const awaiting = leave.filter((r) => r.status === 'pending' || r.status === 'approved').length;
  const shortDay = (ymd: string) =>
    new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(leaveDate(ymd));

  async function withdraw(r: LeaveResponse) {
    setActing(true);
    setActError('');
    try {
      await apiFetch(`/me/leave/${r.id}/withdraw`, { method: 'POST' });
      toastSuccess(t('withdrawn', { ref: r.ref }));
      await load(r.id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      if (err instanceof ApiError && err.status === 409) {
        setActError(t('conflict'));
        await load(r.id);
      } else setActError(t('actionError'));
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="flex max-w-[1240px] flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        <div className="flex min-w-0 grow flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.01em]">{t('mine.title')}</h1>
          {state === 'ready' && (
            <p className="text-sm text-muted-foreground">
              {t('mine.summary', { onFile: leave.length, awaiting })}
            </p>
          )}
        </div>
        {state === 'ready' && (
          <Button size="sm" onClick={() => setNewOpen(true)} className="shrink-0 self-start sm:self-auto">
            {t('request')}
          </Button>
        )}
      </div>

      {state === 'loading' && <Skeleton className="h-40 w-full" />}
      {state === 'disabled' && (
        <EmptyState variant="restricted" title={tm('notEnabledTitle')} description={tm('notEnabled')} />
      )}
      {state === 'error' && <LoadError onRetry={() => void load()} />}

      {state === 'ready' && (
        <>
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'requests' | 'balance')}>
            <TabsList>
              <TabsTab value="requests">{t('tab.requests')}</TabsTab>
              <TabsTab value="balance">{t('mine.balanceTab')}</TabsTab>
            </TabsList>
          </Tabs>

          {tab === 'balance' ? (
            <LeaveTab employeeId={employeeId} terminated={false} endpoint="/me/leave/balance" />
          ) : leave.length === 0 ? (
            <EmptyState
              variant="first-run"
              title={t('mine.emptyTitle')}
              description={t('mine.empty')}
              action={<Button onClick={() => setNewOpen(true)}>{t('request')}</Button>}
            />
          ) : (
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[320px_1fr]">
              <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
                <ul>
                  {leave.map((r) => {
                    const on = r.id === selected;
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(r.id);
                            setActError('');
                          }}
                          aria-current={on ? 'true' : undefined}
                          className={cn(
                            'flex w-full items-center gap-2.5 px-3.5 py-[11px] text-start shadow-[inset_0_-1px_0_var(--border)] transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/60',
                            on && 'bg-neutral-100 hover:bg-neutral-100',
                          )}
                        >
                          <span className="flex min-w-0 grow flex-col gap-px">
                            <span className="truncate text-[13px] leading-[18px] font-medium">
                              {t(`type.${r.type}`)}
                            </span>
                            <span className="truncate text-[11px] leading-[15px] text-muted-foreground">
                              {t('daysCount', { count: r.days })} · {shortDay(r.startDate)}
                            </span>
                          </span>
                          <StatusPill tone={toneFor('leave', r.status)} className="shrink-0">
                            {t(`listStatus.${r.status}`)}
                          </StatusPill>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
                {lq && mine && (
                  <LeaveDetail
                    lq={lq}
                    name={locale === 'ar' ? lq.employee.nameAr : lq.employee.nameEn}
                    company={null}
                    audience="employee"
                    balance={mine.balance}
                    clashes={[]}
                    can={{
                      decide: false,
                      file: false,
                      withdraw: lq.status === 'pending' && lq.raisedByMe,
                    }}
                    acting={acting}
                    actError={actError}
                    onAct={(verb) => verb === 'withdraw' && void withdraw(lq)}
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}

      {mine && (
        <RequestLeaveDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          people={[{ employee: mine.employee, balance: mine.balance }]}
          preselect={mine.employee.id}
          self
          onSubmitted={(row) => {
            setNewOpen(false);
            toastSuccess(t('mine.submitted', { ref: row.ref }));
            setTab('requests');
            void load(row.id);
          }}
        />
      )}
    </div>
  );
}

function sorted(rows: LeaveResponse[]): LeaveResponse[] {
  return [...rows].sort(
    (a, b) => ORDER[a.status] - ORDER[b.status] || b.createdAt.localeCompare(a.createdAt),
  );
}
