'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  ClientResponse,
  EmployeeListResponse,
  EmployeeResponse,
  GroProcessListResponse,
  GroProcessResponse,
  RequestListResponse,
  RequestResponse,
  VacancyListResponse,
  VacancyPipeline,
  VacancyResponse,
} from '@hr/contracts';
import { formatHijri } from '@hr/dates';
import { Link, useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { datedDocs } from '@/lib/employee-docs';
import { toneFor } from '@/lib/status-tone';
import { useCan } from '@/lib/session';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/load-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import { StatusPill } from '@/components/ui/status-pill';
import { toastSuccess } from '@/components/ui/toast';
import { figuresFor } from '../clients/client-figures';
import { RunwayTable } from '../clients/runway-table';
import { PipelineBars } from '../hiring/pipeline-bars';
import { NewRequestDialog } from '../requests/new-request-dialog';
import { PortfolioTable } from './portfolio-table';

// The client manager's Overview (DS-18) — the prototype's client view of its
// home screen (ADR-012): their company only.
//
// What a client manager may read decides what is here, and nothing is widened
// for it except one thing the owner chose: each of their vacancies now carries
// its pipeline COUNTS (no candidate is ever readable — REC-03). Everything else
// already existed: their requests, vacancies and procedures (status only), and
// the portal's company + employees (expiry dates, never identifier numbers).
//
// The portal half is switched off per client (`flag.client-self-service`, off by
// default; the API answers 403). Owner decision: when it is off, requests, the
// hiring pipeline and the procedure counts still work, and every figure built on
// the register says "not enabled" — the portal pages' own calm state.

const WAITING = new Set(['open', 'in_progress']);
const FINISHED = {
  request: new Set(['resolved', 'closed', 'cancelled']),
  gro: new Set(['completed', 'cancelled']),
};
const SHOWN_REQUESTS = 6;
const EMPTY_PIPELINE: VacancyPipeline = {
  applied: 0,
  screening: 0,
  interview: 0,
  offer: 0,
  hired: 0,
};

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

interface Data {
  company: ClientResponse | null;
  employees: EmployeeResponse[];
  portalOff: boolean;
  requests: RequestResponse[];
  vacancies: VacancyResponse[];
  processes: GroProcessResponse[];
}

export function ClientOverview() {
  const t = useTranslations('overview');
  const tc = useTranslations('overview.client');
  const tp = useTranslations('portal');
  const tr = useTranslations('requests');
  const ts = useTranslations('states');
  const tcl = useTranslations('clients');
  const locale = useLocale() as 'ar' | 'en';
  const router = useRouter();
  const canRaise = useCan('request.create');

  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [raiseOpen, setRaiseOpen] = useState(false);

  async function load() {
    setError('');
    const fails: unknown[] = [];
    const get = <T,>(path: string, fallback: T) =>
      apiFetch<T>(path).catch((err) => {
        fails.push(err);
        return fallback;
      });
    const [company, e, r, v, g] = await Promise.all([
      get<ClientResponse | null>('/portal/company', null),
      get<EmployeeListResponse>('/portal/employees', { employees: [] }),
      get<RequestListResponse>('/requests', { requests: [] }),
      get<VacancyListResponse>('/vacancies', { vacancies: [] }),
      get<GroProcessListResponse>('/gro-processes', { processes: [] }),
    ]);
    if (fails.some((x) => x instanceof ApiError && x.status === 401)) {
      return void router.replace('/login');
    }
    // 403 from the portal is the per-client flag being off — a state, not an error.
    const portalOff = fails.some((x) => x instanceof ApiError && x.status === 403) && !company;
    if (fails.length === 5) setError(t('loadError'));
    setData({
      company,
      employees: e.employees,
      portalOff,
      requests: r.requests,
      vacancies: v.vacancies,
      processes: g.processes,
    });
  }

  useEffect(() => {
    void load();
  }, []);

  const people = useMemo(
    () => (data?.employees ?? []).filter((x) => x.employmentStatus !== 'terminated'),
    [data],
  );

  const now = new Date();
  const dateLine = (cleared: number) =>
    [
      new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(now),
      formatHijri(now, locale),
      t('cleared', { count: cleared }),
    ].join(' · ');

  const header = (line: string | null) => (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
      <div className="flex min-w-0 grow flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        {line && <p className="text-sm text-pretty text-muted-foreground">{line}</p>}
      </div>
      <span className="flex shrink-0 gap-2 self-start sm:self-auto">
        <Button variant="outline" size="sm" disabled aria-describedby="ov-export-soon">
          {t('exportRegister')}
          <span id="ov-export-soon" className="text-[11px] font-normal text-muted-foreground">
            {ts('soon')}
          </span>
        </Button>
        {canRaise && (
          <Button size="sm" onClick={() => setRaiseOpen(true)} disabled={!data}>
            {tc('raise')}
          </Button>
        )}
      </span>
    </div>
  );

  const dialog = canRaise && (
    <NewRequestDialog
      open={raiseOpen}
      onOpenChange={setRaiseOpen}
      clients={[]}
      onCreated={() => {
        toastSuccess(tc('raised'));
        void load();
      }}
    />
  );

  if (!data) {
    return (
      <div className="flex max-w-[1360px] flex-col gap-4">
        {header(null)}
        <div className="flex flex-col gap-4" aria-busy="true">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[106px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
        {dialog}
      </div>
    );
  }

  // The tiles.
  const docDays = people.flatMap((e) => datedDocs(e).map((d) => d.days));
  const expiring30 = docDays.filter((n) => n >= 0 && n <= 30).length;
  const expiring7 = docDays.filter((n) => n >= 0 && n <= 7).length;
  const withTeam = data.requests.filter((r) => WAITING.has(r.status)).length;
  const awaiting = data.requests.filter((r) => r.status === 'open').length;
  const pipeline = data.vacancies.reduce<VacancyPipeline>(
    (sum, v) => ({
      applied: sum.applied + v.pipeline.applied,
      screening: sum.screening + v.pipeline.screening,
      interview: sum.interview + v.pipeline.interview,
      offer: sum.offer + v.pipeline.offer,
      hired: sum.hired + v.pipeline.hired,
    }),
    EMPTY_PIPELINE,
  );
  const inProgress = pipeline.applied + pipeline.screening + pipeline.interview + pipeline.offer;
  const openRoles = data.vacancies.filter((v) => v.status === 'open').length;
  const cleared =
    data.requests.filter((r) => FINISHED.request.has(r.status) && isToday(r.updatedAt)).length +
    data.processes.filter((p) => FINISHED.gro.has(p.status) && isToday(p.updatedAt)).length;

  const recent = [...data.requests]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, SHOWN_REQUESTS);
  const shortDate = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  const companyName = data.company
    ? locale === 'ar'
      ? data.company.name.ar
      : data.company.name.en
    : '';

  const off = data.portalOff;
  const offNote = (id: string, title: string): ReactNode => (
    <section
      aria-labelledby={id}
      className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
    >
      <h2 id={id} className="px-5 py-4 text-base leading-6 font-medium">
        {title}
      </h2>
      <p className="border-t px-5 py-6 text-center text-[13px] leading-[18px] text-neutral-400">
        {tp('notEnabled')}
      </p>
    </section>
  );

  return (
    <div className="flex max-w-[1360px] flex-col gap-4">
      {header(dateLine(cleared))}

      {error && <LoadError message={error} onRetry={() => void load()} />}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          href={off ? undefined : '/portal/employees'}
          label={t('tile.expiring')}
          value={off ? '—' : expiring30}
          sub={
            off ? (
              tc('notEnabledShort')
            ) : (
              <span className="font-medium text-status-critical">
                {t('tile.expiringSub', { count: expiring7 })}
              </span>
            )
          }
        />
        <StatTile
          href="/requests"
          label={tc('withTeam')}
          value={withTeam}
          sub={awaiting ? tc('withTeamSub', { count: awaiting }) : tc('nothingOutstanding')}
        />
        <StatTile
          href="/hiring"
          label={tc('candidates')}
          value={inProgress}
          sub={tc('candidatesSub', { count: openRoles })}
        />
        <StatTile
          href={off ? undefined : '/portal/employees'}
          label={t('tile.headcount')}
          value={off ? '—' : people.length}
          sub={off ? tc('notEnabledShort') : companyName}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section
          aria-labelledby="ov-your-requests"
          className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
        >
          <div className="flex items-center gap-3 p-4">
            <span className="flex min-w-0 grow flex-col gap-0.5">
              <h2 id="ov-your-requests" className="text-base leading-6 font-medium">
                {tc('yourRequests')}
              </h2>
              <span className="text-[13px] leading-[18px] text-muted-foreground">
                {tc('yourRequestsHint')}
              </span>
            </span>
            <Button
              variant="ghost"
              size="xs"
              className="shrink-0"
              nativeButton={false}
              render={<Link href="/requests" />}
            >
              {tc('openAll')}
            </Button>
          </div>
          {recent.length === 0 ? (
            <p className="border-t px-4 py-8 text-center text-[13px] leading-[18px] text-neutral-400">
              {tc('requestsEmpty')}
            </p>
          ) : (
            <ul>
              {recent.map((r) => (
                <li key={r.id} className="border-t">
                  <Link
                    href={`/requests?r=${r.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 outline-none hover:bg-neutral-50 focus-visible:bg-neutral-50"
                  >
                    <Avatar name={r.requester?.name ?? null} size="sm" />
                    <span className="flex min-w-0 grow flex-col gap-px">
                      <span className="truncate text-[13px] leading-[18px] font-medium">
                        {r.title}
                      </span>
                      <span className="truncate text-[11px] leading-[15px] text-muted-foreground">
                        {[tr(`type.${r.type}`), r.requester?.name, shortDate(r.createdAt)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <StatusPill tone={toneFor('request', r.status)} className="shrink-0">
                      {tr(`status.${r.status}`)}
                    </StatusPill>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="ov-pipeline"
          className="flex flex-col gap-3.5 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
        >
          <div className="flex items-center gap-2">
            <h2 id="ov-pipeline" className="grow text-base leading-6 font-medium">
              {t('pipeline')}
            </h2>
            <Button
              variant="ghost"
              size="xs"
              className="shrink-0"
              nativeButton={false}
              render={<Link href="/hiring" />}
            >
              {tc('roles')}
            </Button>
          </div>
          <PipelineBars counts={pipeline} />
        </section>
      </div>

      {off || !data.company ? (
        offNote('ov-runway', tcl('runway'))
      ) : (
        <RunwayTable
          id="ov-runway"
          hint={tc('runwayHint', { company: companyName })}
          staff={people}
        />
      )}

      {off || !data.company ? (
        offNote('ov-portfolio', t('portfolio'))
      ) : (
        <section
          aria-labelledby="ov-portfolio"
          className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
        >
          <h2 id="ov-portfolio" className="p-4 text-base leading-6 font-medium">
            {t('portfolio')}
          </h2>
          <PortfolioTable
            labelledBy="ov-portfolio"
            clients={[data.company]}
            figuresOf={(c) => figuresFor(c.id, data.employees, data.processes, data.requests)}
          />
        </section>
      )}

      {dialog}
    </div>
  );
}
