'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  ClientListResponse,
  ClientResponse,
  EmployeeListResponse,
  EmployeeResponse,
  GroProcessListResponse,
  GroProcessResponse,
  RequestListResponse,
  RequestResponse,
  StaffDirectoryEntry,
  StaffDirectoryResponse,
  TaskListResponse,
  TaskResponse,
} from '@hr/contracts';
import { Link } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api';
import { datedDocs, daysTo, isSaudi } from '@/lib/employee-docs';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { GRO_ACTIVE } from '@/components/gro-work-list';
import { figuresFor } from '../clients/client-figures';

// The Reports dashboard (DS-16) — the prototype's analytics panels, computed on
// the page from the list endpoints the screen can already read (owner decision;
// the DS-10 approach). Reports is Administrator + Auditor only, and both see
// every row (task.read-all), so the figures are the whole picture.
//
// What has no data behind it says so (owner decision): government fees (billing)
// and the Nitaqat band. Two panels are adapted rather than invented — service
// level is measured against each request's OWN due date (no promised turnaround
// is stored), and procedures are grouped by TYPE (no portal is stored).

const OPEN = new Set(['open', 'in_progress']);
const ASSIGNABLE = new Set(['administrator', 'hr_officer', 'gro_officer']);
const MONTHS = 6;

interface Data {
  clients: ClientResponse[];
  employees: EmployeeResponse[];
  processes: GroProcessResponse[];
  requests: RequestResponse[];
  tasks: TaskResponse[];
  staff: StaffDirectoryEntry[];
}

const empty =
  <T,>(v: T) =>
  () =>
    v;

export function ReportsDashboard() {
  const t = useTranslations('reports.dash');
  const tg = useTranslations('gro');
  const tr = useTranslations('roles');
  const treq = useTranslations('requests');
  const locale = useLocale();
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    void Promise.all([
      apiFetch<ClientListResponse>('/clients').catch(empty({ clients: [] })),
      apiFetch<EmployeeListResponse>('/employees').catch(empty({ employees: [] })),
      apiFetch<GroProcessListResponse>('/gro-processes').catch(empty({ processes: [] })),
      apiFetch<RequestListResponse>('/requests').catch(empty({ requests: [] })),
      apiFetch<TaskListResponse>('/tasks').catch(empty({ tasks: [] })),
      apiFetch<StaffDirectoryResponse>('/staff-users/directory').catch(empty({ users: [] })),
    ]).then(([c, e, g, r, k, d]) =>
      setData({
        clients: c.clients,
        employees: e.employees,
        processes: g.processes,
        requests: r.requests,
        tasks: k.tasks,
        staff: d.users,
      }),
    );
  }, []);

  const num = useMemo(() => new Intl.NumberFormat(locale === 'ar' ? 'ar' : 'en-US'), [locale]);

  const m = useMemo(() => {
    if (!data) return null;
    const staffRows = data.employees.filter((e) => e.employmentStatus !== 'terminated');
    const saudis = staffRows.filter(isSaudi).length;
    const docs = staffRows.flatMap(datedDocs);
    const procs = data.processes.filter((p) => GRO_ACTIVE.has(p.status));
    const reqs = data.requests.filter((r) => OPEN.has(r.status));
    const tasks = data.tasks.filter((x) => OPEN.has(x.status));
    const work = [
      ...procs.map((p) => ({ due: p.dueDate, who: p.assigneeUserId })),
      ...reqs.map((r) => ({ due: r.dueDate, who: r.assigneeUserId })),
      ...tasks.map((x) => ({ due: x.dueDate, who: x.assigneeUserId })),
    ];
    const late = (due: string | null) => due !== null && daysTo(due) < 0;

    // Expiry forecast: the next six calendar months, this one first.
    const now = new Date();
    const months = Array.from({ length: MONTHS }, (_, i) => {
      const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() + i, 1));
      const key = d.toISOString().slice(0, 7);
      return {
        key,
        label: new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-US', {
          month: 'short',
          timeZone: 'UTC',
        }).format(d),
        n: docs.filter((x) => x.iso.slice(0, 7) === key).length,
      };
    });

    // Officer workload: every assignable person, then unassigned work.
    const officers = data.staff
      .filter((s) => ASSIGNABLE.has(s.role))
      .map((s) => {
        const mine = work.filter((w) => w.who === s.id);
        return { s, open: mine.length, late: mine.filter((w) => late(w.due)).length };
      })
      .sort((a, b) => b.open - a.open);
    const unassigned = work.filter((w) => w.who === null);

    // Service level: requests awaiting a decision, against their own due date.
    const pending = data.requests.filter((r) => r.status === 'open');
    const dated = pending.filter((r) => r.dueDate);
    const breached = dated
      .filter((r) => late(r.dueDate))
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));

    // Procedures by type.
    const byType = [...new Set(procs.map((p) => p.type))]
      .map((type) => ({ type, n: procs.filter((p) => p.type === type).length }))
      .sort((a, b) => b.n - a.n);

    const active = data.clients.filter((c) => c.status === 'active');
    return {
      clients: active.length,
      headcount: staffRows.length,
      saudis,
      saudiPct: staffRows.length ? Math.round((saudis / staffRows.length) * 100) : 0,
      exp30: docs.filter((x) => x.days >= 0 && x.days <= 30).length,
      exp7: docs.filter((x) => x.days >= 0 && x.days <= 7).length,
      open: work.length,
      pastDue: work.filter((w) => late(w.due)).length,
      perClient: active
        .map((c) => ({ c, f: figuresFor(c.id, data.employees, data.processes, data.requests) }))
        .sort((a, b) => b.f.saudiPct - a.f.saudiPct),
      months,
      maxMonth: Math.max(1, ...months.map((x) => x.n)),
      officers,
      maxOpen: Math.max(1, ...officers.map((o) => o.open), unassigned.length),
      unassigned: { open: unassigned.length, late: unassigned.filter((w) => late(w.due)).length },
      sla: {
        pending: pending.length,
        dated: dated.length,
        within: dated.length - breached.length,
        breached,
        undated: pending.length - dated.length,
      },
      byType,
      maxType: Math.max(1, ...byType.map((x) => x.n)),
    };
  }, [data, locale]);

  if (!m) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-[98px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const name = (c: ClientResponse) => (locale === 'ar' ? c.name.ar : c.name.en);
  const tile = (label: string, value: ReactNode, note: ReactNode) => (
    <div className="flex flex-col gap-[3px] rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <span className="text-[11px] leading-4 font-medium text-muted-foreground uppercase ltr:tracking-[0.05em]">
        {label}
      </span>
      <span className="text-[26px] leading-8 font-semibold tracking-[-0.02em] tabular-nums">
        {value}
      </span>
      <span className="text-xs leading-4 text-muted-foreground">{note}</span>
    </div>
  );
  const panel = (id: string, title: string, sub: string, body: ReactNode) => (
    <section
      aria-labelledby={id}
      className="flex min-w-0 flex-col gap-3 rounded-xl bg-card px-5 py-[18px] ring-1 ring-foreground/10"
    >
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="text-base leading-6 font-medium">
          {title}
        </h2>
        <p className="text-[13px] leading-[18px] text-muted-foreground">{sub}</p>
      </div>
      {body}
    </section>
  );
  const bar = (pct: number, cls = 'bg-neutral-900') => (
    <span aria-hidden className="block h-2 grow overflow-hidden rounded-full bg-neutral-100">
      <span className={`block h-2 rounded-full ${cls}`} style={{ width: `${pct}%` }} />
    </span>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {tile(t('tileClients'), num.format(m.clients), t('tileClientsNote'))}
        {tile(
          t('tileHeadcount'),
          num.format(m.headcount),
          t('tileHeadcountNote', { saudis: m.saudis, pct: m.saudiPct }),
        )}
        {tile(t('tileExpiring'), num.format(m.exp30), t('tileExpiringNote', { count: m.exp7 }))}
        {tile(t('tileOpen'), num.format(m.open), t('tileOpenNote', { count: m.pastDue }))}
        {tile(
          t('tileFees'),
          <span className="text-[13px] font-normal text-neutral-400">{t('soon')}</span>,
          t('feesSoonNote'),
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
        {panel(
          'r-saudi',
          t('saudiTitle'),
          t('saudiSub'),
          <ul className="flex flex-col gap-2.5">
            {m.perClient.map(({ c, f }) => (
              <li key={c.id}>
                <Link
                  href={`/clients/${c.id}`}
                  className="flex items-center gap-3 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="w-[150px] shrink-0 truncate text-xs leading-4">{name(c)}</span>
                  {bar(f.saudiPct)}
                  <span className="w-10 shrink-0 text-end font-mono text-xs">{f.saudiPct}%</span>
                  <span className="hidden shrink-0 rounded-full px-1.5 text-[10px] leading-[18px] text-neutral-400 ring-1 ring-neutral-200 ring-inset sm:inline">
                    {t('bandSoon')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>,
        )}
        {panel(
          'r-forecast',
          t('forecastTitle'),
          t('forecastSub', { max: m.maxMonth }),
          <div className="flex h-[150px] items-end gap-2.5 pt-2" role="list">
            {m.months.map((x) => (
              <div
                key={x.key}
                role="listitem"
                aria-label={t('forecastItem', { month: x.label, count: x.n })}
                className="flex grow flex-col items-center justify-end gap-1.5"
              >
                <span className="font-mono text-[11px]">{x.n}</span>
                <span
                  aria-hidden
                  className="block w-full shrink-0 rounded-sm bg-neutral-900"
                  style={{ height: `${Math.max(3, Math.round((x.n / m.maxMonth) * 104))}px` }}
                />
                <span className="text-[10px] leading-[14px] whitespace-nowrap text-muted-foreground">
                  {x.label}
                </span>
              </div>
            ))}
          </div>,
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {panel(
          'r-workload',
          t('workloadTitle'),
          t('workloadSub'),
          <ul className="flex flex-col gap-2.5">
            {m.officers.map(({ s, open, late }) => (
              <li key={s.id} className="flex items-center gap-3">
                <Avatar name={s.displayName} size="sm" />
                <span className="flex w-[130px] min-w-0 shrink-0 flex-col gap-px">
                  <span className="truncate text-xs leading-4">
                    {s.displayName ?? s.id.slice(0, 8)}
                  </span>
                  <span className="text-[10px] leading-[14px] text-muted-foreground">
                    {tr(s.role)}
                  </span>
                </span>
                {bar((open / m.maxOpen) * 100)}
                <span className="w-7 shrink-0 text-end font-mono text-xs">{open}</span>
                <span
                  className={`w-16 shrink-0 text-end font-mono text-[11px] ${late ? 'text-status-critical' : 'text-muted-foreground'}`}
                >
                  {t('late', { count: late })}
                </span>
              </li>
            ))}
            <li className="flex items-center gap-3 border-t pt-2.5">
              <span className="size-6 shrink-0" aria-hidden />
              <span className="w-[130px] shrink-0 text-xs leading-4 text-muted-foreground">
                {t('unassigned')}
              </span>
              {bar((m.unassigned.open / m.maxOpen) * 100, 'bg-neutral-400')}
              <span className="w-7 shrink-0 text-end font-mono text-xs">{m.unassigned.open}</span>
              <span
                className={`w-16 shrink-0 text-end font-mono text-[11px] ${m.unassigned.late ? 'text-status-critical' : 'text-muted-foreground'}`}
              >
                {t('late', { count: m.unassigned.late })}
              </span>
            </li>
          </ul>,
        )}
        {panel(
          'r-sla',
          t('slaTitle'),
          t('slaSub'),
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
              <span
                className={`text-[30px] leading-9 font-semibold tracking-[-0.02em] tabular-nums ${m.sla.breached.length ? 'text-status-warning' : 'text-status-ok'}`}
              >
                {m.sla.dated ? `${Math.round((m.sla.within / m.sla.dated) * 100)}%` : '—'}
              </span>
              <span className="text-[13px] leading-[18px] text-muted-foreground">
                {t('slaLine', {
                  within: m.sla.within,
                  dated: m.sla.dated,
                  breached: m.sla.breached.length,
                })}
              </span>
            </div>
            {m.sla.undated > 0 && (
              <p className="text-xs leading-4 text-muted-foreground">
                {t('slaUndated', { count: m.sla.undated })}
              </p>
            )}
            {m.sla.breached.length === 0 ? (
              <p className="text-[13px] leading-[18px] text-status-ok">{t('slaClean')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {m.sla.breached.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/requests?r=${r.id}`}
                      className="flex items-center gap-3 rounded-md px-2 py-1.5 outline-none hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0 grow truncate text-[13px] leading-[18px]">
                        {treq(`type.${r.type}`)} · {r.title}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-neutral-400">
                        #{r.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span className="w-20 shrink-0 text-end font-mono text-[11px] text-status-critical">
                        {t('daysOver', { count: Math.abs(daysTo(r.dueDate!)) })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>,
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {panel(
          'r-fees',
          t('feesTitle'),
          t('feesSub'),
          <p className="rounded-md bg-neutral-50 px-3.5 py-6 text-center text-[13px] leading-[18px] text-muted-foreground ring-1 ring-foreground/10">
            {t('feesSoon')}
          </p>,
        )}
        {panel(
          'r-types',
          t('typesTitle'),
          t('typesSub'),
          m.byType.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{t('typesEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {m.byType.map((x) => (
                <li key={x.type} className="flex items-center gap-3">
                  <span className="w-[150px] shrink-0 truncate text-xs leading-4">
                    {tg(`type.${x.type}`)}
                  </span>
                  {bar((x.n / m.maxType) * 100)}
                  <span className="w-7 shrink-0 text-end font-mono text-xs">{x.n}</span>
                </li>
              ))}
            </ul>
          ),
        )}
      </div>
    </div>
  );
}
