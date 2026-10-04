'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  CandidateListResponse,
  CandidateResponse,
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
import { formatHijri } from '@hr/dates';
import { Link, useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { datedDocs, daysTo, type DocKey } from '@/lib/employee-docs';
import { useCan, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/load-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import { toastSuccess } from '@/components/ui/toast';
import { ClientFormDialog } from '../clients/client-form-dialog';
import { figuresFor, underManagement, type RunwayBand } from '../clients/client-figures';
import { RunwayTable } from '../clients/runway-table';
import { StartProcedureDialog } from '../employees/[id]/start-procedure-dialog';
import { PipelineBars } from '../hiring/pipeline-bars';
import { isActive } from '../hiring/stages';
import { useQueueItems } from '../queue/queue-items';
import { WorkItemDialog } from '../queue/work-item-dialog';
import { NeedsRow } from './needs-row';

// The Overview (DS-17) — the prototype's home screen (ADR-012), for staff. It
// replaces UX-04's "Today" work list, whose job the Work queue (DS-12) now does
// in full; /today redirects here.
//
// Everything is computed on the page from the list endpoints the viewer can
// already read (the DS-10/DS-16 approach) — no new endpoint. The shared rules
// keep it agreeing with the other screens: open work and its order come from
// queue-items.ts (the Work queue), document dates from lib/employee-docs (People),
// per-client figures from client-figures.ts (the Client record), the runway and
// the pipeline bars are the Client record's own components.
//
// Scope follows the viewer: tasks are own/assigned unless task.read-all, so an HR
// or GRO officer's "past due" and "needs you first" are their own slice — the
// screen says so, as the Work queue does.
//
// What has no data behind it is shown and marked (owner rule): Export register,
// the Nitaqat band, dependants' documents, mobilisations and exits.
//
// "Cleared today" (owner decision, DS-17) is derived: work that is now finished
// and was last updated today, among what the viewer can see. Close, not exact — an
// edit to an already-finished item would count it again.
//
// Client managers get their own Overview in DS-18; until then they keep landing
// on the portal, and anyone who arrives here is sent there.

const ASSIGNABLE = new Set(['administrator', 'hr_officer', 'gro_officer']);
const FINISHED = {
  gro: new Set(['completed', 'cancelled']),
  request: new Set(['resolved', 'closed', 'cancelled']),
  task: new Set(['done', 'cancelled']),
};
const NEEDS = 5;

// A runway cell's cohort on People: the runway's bands, in People's filter values.
const PEOPLE_BAND: Record<RunwayBand, string> = {
  overdue: 'overdue',
  d7: '0-7',
  d14: '8-14',
  d30: '15-30',
  d60: '31-60',
  d90: '61-90',
};
const cohortHref = (doc: DocKey, band: RunwayBand | null) =>
  `/employees?doc=${doc}${band ? `&band=${PEOPLE_BAND[band]}` : ''}`;

interface Data {
  clients: ClientResponse[];
  employees: EmployeeResponse[];
  processes: GroProcessResponse[];
  requests: RequestResponse[];
  tasks: TaskResponse[];
  candidates: CandidateResponse[];
  staff: StaffDirectoryEntry[];
}
const EMPTY: Data = {
  clients: [],
  employees: [],
  processes: [],
  requests: [],
  tasks: [],
  candidates: [],
  staff: [],
};

/** Same local calendar day as now. */
const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

export default function OverviewPage() {
  const t = useTranslations('overview');
  const tq = useTranslations('queue');
  const ts = useTranslations('states');
  const locale = useLocale() as 'ar' | 'en';
  const router = useRouter();
  const me = useSession();
  const canReadAllTasks = useCan('task.read-all');
  const canCandidates = useCan('candidate.read');
  const canStartProcedure = useCan('gro.process');
  const canAddClient = useCan('client.create');
  const isStaff = me.principalType === 'staff';

  const [data, setData] = useState<Data>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [procOpen, setProcOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);

  // Each source is optional: a role that cannot read one simply has none of it.
  // Only when nothing at all loads is it an error.
  async function load() {
    setError('');
    const fails: unknown[] = [];
    const get = <T,>(path: string, fallback: T) =>
      apiFetch<T>(path).catch((err) => {
        fails.push(err);
        return fallback;
      });
    const [c, e, g, r, k, d, cand] = await Promise.all([
      get<ClientListResponse>('/clients', { clients: [] }),
      get<EmployeeListResponse>('/employees', { employees: [] }),
      get<GroProcessListResponse>('/gro-processes', { processes: [] }),
      get<RequestListResponse>('/requests', { requests: [] }),
      get<TaskListResponse>('/tasks', { tasks: [] }),
      get<StaffDirectoryResponse>('/staff-users/directory', { users: [] }),
      canCandidates
        ? get<CandidateListResponse>('/candidates', { candidates: [] })
        : Promise.resolve({ candidates: [] }),
    ]);
    if (fails.some((x) => x instanceof ApiError && x.status === 401)) {
      return void router.replace('/login');
    }
    if (fails.length >= 6) setError(t('loadError'));
    setData({
      clients: c.clients,
      employees: e.employees,
      processes: g.processes,
      requests: r.requests,
      tasks: k.tasks,
      candidates: cand.candidates,
      staff: d.users.filter((u) => ASSIGNABLE.has(u.role)),
    });
    setLoaded(true);
  }

  useEffect(() => {
    if (!isStaff) return void router.replace('/portal/company');
    void load();
  }, []);

  const items = useQueueItems(data);
  const people = useMemo(
    () => underManagement(data.employees, data.clients),
    [data.employees, data.clients],
  );
  const activeClients = useMemo(
    () =>
      data.clients
        .filter((c) => c.status === 'active')
        .sort((a, b) =>
          (locale === 'ar' ? a.name.ar : a.name.en).localeCompare(
            locale === 'ar' ? b.name.ar : b.name.en,
            locale,
          ),
        ),
    [data.clients, locale],
  );

  if (!isStaff) return null;

  // The tiles.
  const docDays = people.flatMap((e) => datedDocs(e).map((d) => d.days));
  const expiring30 = docDays.filter((n) => n >= 0 && n <= 30).length;
  const expiring7 = docDays.filter((n) => n >= 0 && n <= 7).length;
  const pastDue = items.filter((i) => i.due !== null && daysTo(i.due) < 0);
  const oldest = pastDue.reduce((m, i) => Math.max(m, -daysTo(i.due as string)), 0);
  const waiting = data.requests.filter((r) => r.status === 'open').length;
  const cleared =
    data.processes.filter((p) => FINISHED.gro.has(p.status) && isToday(p.updatedAt)).length +
    data.requests.filter((r) => FINISHED.request.has(r.status) && isToday(r.updatedAt)).length +
    data.tasks.filter((k) => FINISHED.task.has(k.status) && isToday(k.updatedAt)).length;

  const now = new Date();
  const todayLine = [
    new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(now),
    formatHijri(now, locale),
    t('cleared', { count: cleared }),
  ].join(' · ');

  const clientName = (c: ClientResponse) => (locale === 'ar' ? c.name.ar : c.name.en);
  const expiringTone = (n: number) =>
    n > 3 ? 'text-status-critical' : n > 1 ? 'text-status-warning' : 'text-neutral-500';

  return (
    <div className="flex max-w-[1360px] flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        <div className="flex min-w-0 grow flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          {loaded && <p className="text-sm text-pretty text-muted-foreground">{todayLine}</p>}
        </div>
        <span className="flex shrink-0 gap-2 self-start sm:self-auto">
          <Button variant="outline" size="sm" disabled aria-describedby="ov-export-soon">
            {t('exportRegister')}
            <span id="ov-export-soon" className="text-[11px] font-normal text-muted-foreground">
              {ts('soon')}
            </span>
          </Button>
          {canStartProcedure && (
            <Button size="sm" onClick={() => setProcOpen(true)} disabled={!loaded}>
              {t('startProcedure')}
            </Button>
          )}
        </span>
      </div>

      {error && <LoadError message={error} onRetry={() => void load()} />}

      {!loaded ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[106px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              href="/employees"
              label={t('tile.expiring')}
              value={expiring30}
              sub={
                <span className="font-medium text-status-critical">
                  {t('tile.expiringSub', { count: expiring7 })}
                </span>
              }
            />
            <StatTile
              href="/queue"
              label={t('tile.pastDue')}
              value={pastDue.length}
              sub={
                pastDue.length ? (
                  <span className="font-medium text-status-critical">
                    {t('tile.pastDueSub', { days: oldest })}
                  </span>
                ) : (
                  t('tile.queueCurrent')
                )
              }
            />
            <StatTile
              href="/requests"
              label={t('tile.requests')}
              value={waiting}
              sub={t('tile.requestsSub', { count: waiting })}
            />
            <StatTile
              href="/clients"
              label={t('tile.headcount')}
              value={people.length}
              sub={t('tile.headcountSub', { count: activeClients.length })}
            />
          </div>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
            <section
              aria-labelledby="ov-needs"
              className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
            >
              <div className="flex items-center gap-3 p-4">
                <span className="flex min-w-0 grow flex-col gap-0.5">
                  <h2 id="ov-needs" className="text-base leading-6 font-medium">
                    {t('needs')}
                  </h2>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {t('needsHint')}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  className="shrink-0"
                  nativeButton={false}
                  render={<Link href="/queue" />}
                >
                  {t('fullQueue')}
                </Button>
              </div>
              {items.length === 0 ? (
                <p className="border-t px-4 py-8 text-center text-[13px] leading-[18px] text-neutral-400">
                  {t('needsEmpty')}
                </p>
              ) : (
                <ul>
                  {items.slice(0, NEEDS).map((i) => (
                    <NeedsRow
                      key={`${i.kind}-${i.id}`}
                      item={i}
                      onChanged={load}
                      onOpen={() => setOpenKey(`${i.kind}-${i.id}`)}
                    />
                  ))}
                </ul>
              )}
              {!canReadAllTasks && (
                <p className="border-t px-4 py-2.5 text-xs leading-4 text-muted-foreground">
                  {tq('tasksOwnNote')}
                </p>
              )}
            </section>

            {canCandidates && (
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
                    {t('board')}
                  </Button>
                </div>
                <PipelineBars candidates={data.candidates.filter((c) => isActive(c.stage))} />
              </section>
            )}
          </div>

          <RunwayTable id="ov-runway" hint={t('runwayHint')} staff={people} cellHref={cohortHref} />

          <section
            aria-labelledby="ov-portfolio"
            className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
          >
            <div className="flex items-center gap-3 p-4">
              <h2 id="ov-portfolio" className="grow text-base leading-6 font-medium">
                {t('portfolio')}
              </h2>
              <Button
                variant="ghost"
                size="xs"
                className="shrink-0"
                nativeButton={false}
                render={<Link href="/clients" />}
              >
                {t('allClients')}
              </Button>
              {canAddClient && (
                <Button
                  variant="outline"
                  size="xs"
                  className="shrink-0"
                  onClick={() => setClientOpen(true)}
                >
                  {t('addClient')}
                </Button>
              )}
            </div>
            <div
              role="region"
              aria-labelledby="ov-portfolio"
              tabIndex={0}
              className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring"
            >
              <table className="w-full min-w-[680px] border-separate border-spacing-0 text-[13px] leading-[18px]">
                <colgroup>
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '12.5%' }} />
                  <col style={{ width: '16.25%' }} />
                  <col style={{ width: '12.5%' }} />
                  <col style={{ width: '12.5%' }} />
                  <col style={{ width: '12.5%' }} />
                </colgroup>
                <thead>
                  <tr className="bg-neutral-100 text-xs leading-4 text-muted-foreground">
                    <th scope="col" className="px-4 py-2 text-start font-medium">
                      {t('col.client')}
                    </th>
                    <th scope="col" className="px-4 py-2 text-end font-medium">
                      {t('col.headcount')}
                    </th>
                    <th scope="col" className="px-4 py-2 text-start font-medium">
                      {t('col.band')}
                    </th>
                    <th scope="col" className="px-4 py-2 text-end font-medium">
                      {t('col.saudi')}
                    </th>
                    <th scope="col" className="px-4 py-2 text-end font-medium">
                      {t('col.expiring')}
                    </th>
                    <th scope="col" className="px-4 py-2 text-end font-medium">
                      {t('col.open')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activeClients.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="border-t px-4 py-8 text-center text-neutral-400">
                        {t('portfolioEmpty')}
                      </td>
                    </tr>
                  ) : (
                    activeClients.map((c) => {
                      const f = figuresFor(c.id, data.employees, data.processes, data.requests);
                      return (
                        <tr key={c.id} className="h-14 [&>td]:border-t [&>td]:px-4">
                          <th scope="row" className="border-t px-4 py-2 text-start font-normal">
                            <Link
                              href={`/clients/${c.id}`}
                              className="flex flex-col gap-px outline-none hover:underline focus-visible:underline"
                            >
                              <span className="text-sm leading-5 font-medium">{clientName(c)}</span>
                              {locale === 'en' && (
                                <span
                                  dir="rtl"
                                  className="text-start text-xs leading-4 text-muted-foreground"
                                >
                                  {c.name.ar}
                                </span>
                              )}
                            </Link>
                          </th>
                          <td className="text-end font-mono">{f.headcount}</td>
                          <td className="text-xs text-neutral-400">{ts('soon')}</td>
                          <td className="text-end font-mono">{f.saudiPct}%</td>
                          <td className={cn('text-end font-mono', expiringTone(f.expiring30))}>
                            {f.expiring30}
                          </td>
                          <td className="text-end font-mono">{f.openItems}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <p className="border-t px-4 py-2.5 text-xs leading-4 text-muted-foreground">
              {t('portfolioNote')}
            </p>
          </section>

          <section
            aria-labelledby="ov-mob"
            className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
          >
            <div className="flex flex-col gap-0.5 px-5 py-4">
              <h2 id="ov-mob" className="text-base leading-6 font-medium">
                {t('mob')}
              </h2>
              <p className="text-[13px] leading-[18px] text-muted-foreground">{t('mobHint')}</p>
            </div>
            <p className="border-t px-5 py-6 text-center text-[13px] leading-[18px] text-neutral-400">
              {t('mobSoon')}
            </p>
          </section>
        </>
      )}

      <WorkItemDialog
        item={items.find((i) => `${i.kind}-${i.id}` === openKey) ?? null}
        staff={data.staff}
        onChanged={load}
        onClose={() => setOpenKey(null)}
      />
      {canStartProcedure && (
        <StartProcedureDialog
          open={procOpen}
          onOpenChange={setProcOpen}
          description={t('procDescription')}
          onStarted={() => void load()}
          choices={people
            .map((e) => {
              const c = data.clients.find((x) => x.id === e.clientId);
              const who = locale === 'ar' ? e.name.ar : e.name.en;
              return { id: e.id, name: c ? `${who} · ${clientName(c)}` : who };
            })
            .sort((a, b) => a.name.localeCompare(b.name, locale))}
        />
      )}
      {canAddClient && (
        <ClientFormDialog
          open={clientOpen}
          onOpenChange={setClientOpen}
          onSaved={(saved) => {
            toastSuccess(t('clientAdded', { name: clientName(saved) }));
            router.push(`/clients/${saved.id}`);
          }}
        />
      )}
    </div>
  );
}
