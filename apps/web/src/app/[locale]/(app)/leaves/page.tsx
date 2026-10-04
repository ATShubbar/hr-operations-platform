'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Clock, Scale, TriangleAlert } from 'lucide-react';
import type {
  ClientListResponse,
  ClientResponse,
  LeaveBalanceListResponse,
  LeaveListResponse,
  LeaveResponse,
  LeaveType,
} from '@hr/contracts';
import { formatHijri } from '@hr/dates';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import type { Locale } from '@/lib/employee-format';
import { LEAVE_TYPES, addDays, deductsBalance, leaveDate, overlaps, riyadhToday } from '@/lib/leave';
import { useCan, useSession } from '@/lib/session';
import { toneFor } from '@/lib/status-tone';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { LoadError, NoAccess } from '@/components/ui/load-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs';
import { toastSuccess } from '@/components/ui/toast';
import { BalancesTab } from './balances-tab';
import { RequestLeaveDialog } from './request-leave-dialog';

// Leaves (LEAVE-04, ADR-014) — the prototype's screen (ADR-012): four tiles, the
// Requests tab (list beside the selected request's detail) and the Request leave
// dialog, and (LEAVE-05) the Balances tab. Who may do what comes from the server's bundles: raise (leave.create),
// approve/decline (leave.approve — a client manager for their own company, an
// Administrator on the employer's behalf), file (leave.file, staff), withdraw
// (whoever raised it, while pending).
//
// Kept from the prototype on purpose: no search box (its list has none), the
// type filter, "N awaiting the employer, M awaiting filing" as the summary.
// Deviation: the start date is a date picker (owner decision), and the
// service level is shown "soon" (no SLA is stored).

const ALL = 'all';
const ORDER: Record<LeaveResponse['status'], number> = {
  pending: 0,
  approved: 1,
  filed: 2,
  declined: 3,
  withdrawn: 4,
};

export default function LeavesPage() {
  const t = useTranslations('leaves');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const session = useSession();
  const isStaff = session.principalType === 'staff';
  const canCreate = useCan('leave.create');
  const canApprove = useCan('leave.approve');
  const canFile = useCan('leave.file');
  const canWithdraw = useCan('leave.withdraw');

  const [leave, setLeave] = useState<LeaveResponse[]>([]);
  const [people, setPeople] = useState<LeaveBalanceListResponse['balances']>([]);
  const [clients, setClients] = useState<ClientResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [kind, setKind] = useState<string>(ALL);
  const [tab, setTab] = useState<'requests' | 'balances'>('requests');
  const [newOpen, setNewOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const [actError, setActError] = useState('');

  async function load(keep?: string) {
    setError('');
    try {
      const [l, b] = await Promise.all([
        apiFetch<LeaveListResponse>('/leave'),
        apiFetch<LeaveBalanceListResponse>('/leave/balances'),
      ]);
      setLeave(l.leave);
      setPeople(b.balances);
      setSelected((cur) => keep ?? cur ?? sorted(l.leave)[0]?.id ?? null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setError(t('error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(new URLSearchParams(window.location.search).get('l') ?? undefined);
    // Company names for staff; a client manager's /clients is 403 — they are
    // only ever looking at their own company, so it is simply not named.
    if (isStaff) {
      apiFetch<ClientListResponse>('/clients')
        .then((r) => setClients(r.clients))
        .catch(() => setClients([]));
    }
  }, []);

  const today = riyadhToday();
  const name = (r: LeaveResponse) => (locale === 'ar' ? r.employee.nameAr : r.employee.nameEn);
  const clientName = (id: string) => {
    const c = clients.find((x) => x.id === id);
    return c ? (locale === 'ar' ? c.name.ar : c.name.en) : null;
  };
  const shortDay = (ymd: string) =>
    new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(leaveDate(ymd));
  const longDay = (ymd: string) =>
    new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(leaveDate(ymd));

  const list = useMemo(
    () => sorted(leave).filter((r) => kind === ALL || r.type === kind),
    [leave, kind],
  );
  const lq = leave.find((r) => r.id === selected) ?? null;

  // The four tiles (the prototype's lvStats).
  const live = (r: LeaveResponse) => r.status === 'approved' || r.status === 'filed';
  const away = leave.filter((r) => live(r) && r.startDate <= today && today <= r.endDate);
  const soon = leave.filter((r) => live(r) && r.startDate > today && r.startDate <= addDays(today, 14));
  const pending = leave.filter((r) => r.status === 'pending').length;
  const approved = leave.filter((r) => r.status === 'approved').length;
  const tiles = [
    {
      label: t('stat.awayToday'),
      n: away.length,
      // Full names, not the prototype's first word: splitting at the first space
      // turns a compound Arabic name like «عبد الله» into «عبد». The line truncates.
      sub: away.length
        ? away
            .map((r) => name(r))
            .slice(0, 3)
            .join(locale === 'ar' ? '، ' : ', ')
        : t('stat.awayNone'),
    },
    {
      label: t('stat.leavingSoon'),
      n: soon.length,
      sub: soon.length ? t('stat.leavingSub') : t('stat.leavingNone'),
    },
    { label: t('stat.awaitingEmployer'), n: pending, sub: t('stat.awaitingEmployerSub') },
    { label: t('stat.awaitingFiling'), n: approved, sub: t('stat.awaitingFilingSub') },
  ];

  // Colleagues at the same company away over the same dates (the prototype's
  // leaveClashes): anything not declined or withdrawn.
  const clashes = lq
    ? leave.filter(
        (r) =>
          r.id !== lq.id &&
          r.clientId === lq.clientId &&
          r.employee.id !== lq.employee.id &&
          r.status !== 'declined' &&
          r.status !== 'withdrawn' &&
          overlaps(r, lq),
      )
    : [];

  async function act(r: LeaveResponse, verb: 'approve' | 'decline' | 'file' | 'withdraw') {
    setActing(true);
    setActError('');
    try {
      await apiFetch(`/leave/${r.id}/${verb}`, { method: 'POST' });
      toastSuccess(
        t(
          verb === 'approve'
            ? 'approved'
            : verb === 'decline'
              ? 'declined'
              : verb === 'file'
                ? 'filedToast'
                : 'withdrawn',
          { ref: r.ref },
        ),
      );
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

  if (forbidden) {
    return (
      <div className="flex max-w-[1240px] flex-col gap-4">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <NoAccess capability="leave.read" />
      </div>
    );
  }

  return (
    <div className="flex max-w-[1240px] flex-col gap-4">
      {/* ---- header ---- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        <div className="flex min-w-0 grow flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.01em]">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('summary', { pending, approved })}</p>
        </div>
        {canCreate && (
          <Button size="sm" onClick={() => setNewOpen(true)} className="shrink-0 self-start sm:self-auto">
            {t('request')}
          </Button>
        )}
      </div>

      {error && <LoadError message={error} onRetry={() => void load()} hasContent={leave.length > 0} />}

      {/* ---- tiles: one strip, four cells (the prototype's lvStats) ---- */}
      <div className="grid grid-cols-2 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:grid-cols-4">
        {tiles.map((s, i) => (
          <div
            key={s.label}
            className={cn(
              'flex min-w-0 flex-col gap-0.5 px-[18px] py-3.5',
              i % 2 === 1 && 'border-s',
              i >= 2 && 'border-t lg:border-t-0',
              i === 2 && 'lg:border-s',
            )}
          >
            <span className="text-[11px] leading-[15px] text-muted-foreground uppercase ltr:tracking-[0.04em]">
              {s.label}
            </span>
            <span className="text-[26px] leading-8 font-semibold tracking-[-0.02em] tabular-nums">
              {loading ? <Skeleton className="my-1 h-6 w-8" /> : s.n}
            </span>
            <span className="truncate text-[11px] leading-[15px] text-neutral-400">{s.sub}</span>
          </div>
        ))}
      </div>

      {/* ---- tabs + type filter ---- */}
      {/* Below sm the filter stacks under the tabs: side by side, a 200px select
          squeezed the tab list until "Balances" was cut off at 375px. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'requests' | 'balances')} className="min-w-0 grow">
          <TabsList>
            <TabsTab value="requests">{t('tab.requests')}</TabsTab>
            <TabsTab value="balances">{t('tab.balances')}</TabsTab>
          </TabsList>
        </Tabs>
        {tab === 'requests' && (
          <Select value={kind} onValueChange={(v) => setKind(v ?? ALL)}>
            <SelectTrigger size="sm" className="w-full shrink-0 sm:w-[200px]" aria-label={t('filterType')}>
              <SelectValue>{(v) => (v === ALL ? t('allTypes') : t(`type.${String(v)}`))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('allTypes')}</SelectItem>
              {LEAVE_TYPES.map((ty) => (
                <SelectItem key={ty} value={ty}>
                  {t(`type.${ty}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {tab === 'balances' ? (
        <BalancesTab rows={people} loading={loading} clientName={clientName} linkRows={isStaff} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[320px_1fr]">
          {/* ---- list ---- */}
          <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            {loading &&
              [0, 1, 2, 3].map((i) => (
                <div key={i} className="px-3.5 py-3 shadow-[inset_0_-1px_0_var(--border)]">
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ))}
            {!loading && list.length === 0 && (
              <p className="px-4 py-7 text-center text-[13px] leading-[18px] text-neutral-400">
                {leave.length === 0 ? t('empty') : t('noneOfType')}
              </p>
            )}
            <ul>
              {list.map((r) => {
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
                      <Avatar name={name(r)} size="sm" />
                      <span className="flex min-w-0 grow flex-col gap-px">
                        <span className="truncate text-[13px] leading-[18px] font-medium">
                          {t(`type.${r.type}`)}
                        </span>
                        <span className="truncate text-[11px] leading-[15px] text-muted-foreground">
                          {name(r)} · {t('daysCount', { count: r.days })} · {shortDay(r.startDate)}
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

          {/* ---- detail ---- */}
          <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            {!lq ? (
              <p className="px-6 py-16 text-center text-sm text-muted-foreground">
                {loading ? ' ' : t('selectOne')}
              </p>
            ) : (
              <Detail
                lq={lq}
                t={t}
                locale={locale}
                name={name(lq)}
                company={clientName(lq.clientId)}
                isStaff={isStaff}
                balance={people.find((p) => p.employee.id === lq.employee.id)?.balance ?? null}
                clashes={clashes.map((c) => ({
                  id: c.id,
                  name: name(c),
                  type: t(`type.${c.type}`),
                  window: `${shortDay(c.startDate)} — ${shortDay(c.endDate)}`,
                }))}
                longDay={longDay}
                can={{
                  decide: lq.status === 'pending' && canApprove,
                  file: lq.status === 'approved' && canFile && isStaff,
                  withdraw: lq.status === 'pending' && lq.raisedByMe && canWithdraw,
                }}
                acting={acting}
                actError={actError}
                onAct={(verb) => void act(lq, verb)}
              />
            )}
          </div>
        </div>
      )}

      <RequestLeaveDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        people={people}
        onSubmitted={(row) => {
          setNewOpen(false);
          toastSuccess(t('dialog.submitted', { ref: row.ref }));
          setKind(ALL);
          void load(row.id);
        }}
      />
    </div>
  );
}

// The prototype's order: waiting on the employer, then waiting to be filed, then
// finished — newest first within each.
function sorted(rows: LeaveResponse[]): LeaveResponse[] {
  return [...rows].sort(
    (a, b) => ORDER[a.status] - ORDER[b.status] || b.createdAt.localeCompare(a.createdAt),
  );
}

function Detail({
  lq,
  t,
  locale,
  name,
  company,
  isStaff,
  balance,
  clashes,
  longDay,
  can,
  acting,
  actError,
  onAct,
}: {
  lq: LeaveResponse;
  t: ReturnType<typeof useTranslations<'leaves'>>;
  locale: Locale;
  name: string;
  company: string | null;
  isStaff: boolean;
  balance: LeaveBalanceListResponse['balances'][number]['balance'] | null;
  clashes: { id: string; name: string; type: string; window: string }[];
  longDay: (ymd: string) => string;
  can: { decide: boolean; file: boolean; withdraw: boolean };
  acting: boolean;
  actError: string;
  onAct: (verb: 'approve' | 'decline' | 'file' | 'withdraw') => void;
}) {
  const type = lq.type as LeaveType;
  const employer = company ?? t('wait.theEmployer');
  const waitLine =
    lq.status === 'pending'
      ? isStaff
        ? t('wait.pendingStaff', { client: employer })
        : t('wait.pendingClient')
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
