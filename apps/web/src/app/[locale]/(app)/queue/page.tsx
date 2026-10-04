'use client';

import { useEffect, useState } from 'react';
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
import { matchesAnyField } from '@hr/text';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { daysTo } from '@/lib/employee-docs';
import { useCan, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadError } from '@/components/ui/load-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { NewTaskDialog } from '../tasks/new-task-dialog';
import { QueueRow } from './queue-row';
import type { QueueItem } from './queue-actions';
import { FinishedRow } from './finished-row';
import { useQueueItems, type QueueView } from './queue-items';
import { WorkItemDialog } from './work-item-dialog';

// The Work queue (DS-12) — the prototype's queue (ADR-012): every open piece of
// work in one list, grouped by how urgent it is — government procedures, requests
// and internal tasks, each read from its own API (no new endpoint).
//
// What counts as open, and the order, live in queue-items.ts (shared with the
// Overview, DS-17). Tasks are listed as
// the viewer can see them (task.read-all → all, else own or assigned — the rule
// DS-11 set for the Client record) and the screen says so.
//
// The bands are the prototype's deadline grouping. Their notes are this
// product's own: the prototype's ("statutory fines accrue daily", "portals close
// 15:00 Thursday") assert facts nothing here has verified.
//
// Clicking a row's title opens the work-item dialog (DS-13).

type Band = 'over' | 'today' | 'week' | 'later' | 'none';
const BANDS: readonly Band[] = ['over', 'today', 'week', 'later', 'none'];
const KINDS = ['all', 'procedure', 'request', 'task'] as const;
type KindFilter = (typeof KINDS)[number];
const ALL = 'all';
const ASSIGNABLE = new Set(['administrator', 'hr_officer', 'gro_officer']);

const BAND_HEAD: Record<Band, { bg: string; dot: string; text: string }> = {
  over: { bg: 'bg-status-critical/10', dot: 'bg-status-critical', text: 'text-status-critical' },
  today: { bg: 'bg-status-warning/10', dot: 'bg-status-warning', text: 'text-status-warning' },
  week: { bg: 'bg-neutral-100', dot: 'bg-neutral-900', text: 'text-foreground' },
  later: { bg: 'bg-neutral-50', dot: 'bg-neutral-300', text: 'text-muted-foreground' },
  none: { bg: 'bg-neutral-50', dot: 'bg-neutral-200', text: 'text-muted-foreground' },
};

function bandOf(due: string | null): Band {
  if (!due) return 'none';
  const n = daysTo(due);
  if (n < 0) return 'over';
  if (n === 0) return 'today';
  if (n <= 7) return 'week';
  return 'later';
}

// Finished work grouped by the local month it finished, newest first (the items
// arrive sorted).
function useMonths(locale: string) {
  return (items: readonly QueueItem[]) => {
    const out: { key: string; label: string; items: QueueItem[] }[] = [];
    for (const i of items) {
      const d = new Date(i.finishedAt ?? i.createdAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      let g = out.find((x) => x.key === key);
      if (!g) {
        g = {
          key,
          label: new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
            month: 'long',
            year: 'numeric',
          }).format(d),
          items: [],
        };
        out.push(g);
      }
      g.items.push(i);
    }
    return out;
  };
}

export default function WorkQueuePage() {
  const t = useTranslations('queue');
  const locale = useLocale();
  const monthsOf = useMonths(locale);
  const router = useRouter();
  const me = useSession().userId;
  const canCreateTask = useCan('task.create');
  const canReadAllTasks = useCan('task.read-all');

  const [processes, setProcesses] = useState<GroProcessResponse[]>([]);
  const [requests, setRequests] = useState<RequestResponse[]>([]);
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [employees, setEmployees] = useState<EmployeeResponse[]>([]);
  const [clients, setClients] = useState<ClientResponse[]>([]);
  const [staff, setStaff] = useState<StaffDirectoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<KindFilter>(ALL);
  const [client, setClient] = useState(ALL);
  const [mine, setMine] = useState(false);
  // DS-22b: Open (the queue) or Finished (the history the GRO and Task history
  // screens held). `?view=finished&kind=procedure|task` arrives from their old
  // URLs; read from window.location, not useSearchParams (no Suspense boundary).
  const [view, setView] = useState<QueueView>('open');
  const [newOpen, setNewOpen] = useState(false);
  // The open work item, by kind + id, so a reload hands the dialog fresh data.
  const [openKey, setOpenKey] = useState<string | null>(null);

  // Each source is optional: a role that cannot read one kind of work simply has
  // none of it here. Only when nothing at all loads is it an error.
  async function load() {
    setError('');
    const fails: unknown[] = [];
    const get = <T,>(path: string, fallback: T) =>
      apiFetch<T>(path).catch((err) => {
        fails.push(err);
        return fallback;
      });
    const [g, r, tk, e, c, d] = await Promise.all([
      get<GroProcessListResponse>('/gro-processes', { processes: [] }),
      get<RequestListResponse>('/requests', { requests: [] }),
      get<TaskListResponse>('/tasks', { tasks: [] }),
      get<EmployeeListResponse>('/employees', { employees: [] }),
      get<ClientListResponse>('/clients', { clients: [] }),
      get<StaffDirectoryResponse>('/staff-users/directory', { users: [] }),
    ]);
    if (fails.some((x) => x instanceof ApiError && x.status === 401)) {
      return void router.replace('/login');
    }
    if (fails.length === 6) setError(t('loadError'));
    setProcesses(g.processes);
    setRequests(r.requests);
    setTasks(tk.tasks);
    setEmployees(e.employees);
    setClients(c.clients);
    setStaff(d.users.filter((u) => ASSIGNABLE.has(u.role)));
    setLoaded(true);
  }
  useEffect(() => {
    void load();
    const q = new URLSearchParams(window.location.search);
    if (q.get('view') === 'finished') setView('finished');
    const k = q.get('kind');
    if (k && (KINDS as readonly string[]).includes(k)) setKind(k as KindFilter);
  }, []);

  const clientName = (id: string | null) => {
    if (!id) return null;
    const c = clients.find((x) => x.id === id);
    return c ? (locale === 'ar' ? c.name.ar : c.name.en) : null;
  };

  const sources = { processes, requests, tasks, employees, clients };
  const all = useQueueItems(sources);
  const finished = useQueueItems(sources, 'finished');
  const pool = view === 'open' ? all : finished;

  const shown = pool.filter(
    (i) =>
      (kind === ALL || i.kind === kind) &&
      (client === ALL || i.clientId === client) &&
      (!mine || i.assigneeUserId === me) &&
      matchesAnyField([...i.searchText, clientName(i.clientId) ?? ''], search),
  );
  const filtered = kind !== ALL || client !== ALL || mine || search.trim() !== '';
  const reset = () => {
    setKind(ALL);
    setClient(ALL);
    setMine(false);
    setSearch('');
  };

  return (
    <div className="flex max-w-[1240px] flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        <div className="flex min-w-0 grow flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          {loaded && (
            <p className="text-sm text-muted-foreground">
              {view === 'open'
                ? t('summary', { shown: shown.length, total: all.length })
                : t('summaryFinished', { shown: shown.length, total: finished.length })}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2 self-start sm:self-auto">
          <Button variant="outline" size="sm" onClick={reset} disabled={!filtered}>
            {t('clearFilters')}
          </Button>
          {canCreateTask && (
            <Button size="sm" onClick={() => setNewOpen(true)}>
              {t('newTask')}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label={t('viewLabel')}
          className="flex h-7 items-center gap-0.5 rounded-lg bg-neutral-100 p-0.5"
        >
          {(['open', 'finished'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                'h-6 rounded-md px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                view === v
                  ? 'bg-card text-foreground shadow-sm ring-1 ring-foreground/10'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(`view.${v}`)}
            </button>
          ))}
        </div>
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="h-7 w-full text-sm sm:w-[300px]"
        />
        <div
          role="group"
          aria-label={t('kindLabel')}
          className="flex h-7 items-center gap-0.5 rounded-lg bg-neutral-100 p-0.5"
        >
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                'h-6 rounded-md px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                kind === k
                  ? 'bg-card text-foreground shadow-sm ring-1 ring-foreground/10'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(`kind.${k}`)}
            </button>
          ))}
        </div>
        <Select value={client} onValueChange={(v) => setClient(v ?? ALL)}>
          <SelectTrigger size="sm" className="w-[200px]" aria-label={t('clientLabel')}>
            <SelectValue>
              {(v) => (v === ALL ? t('allClients') : (clientName(String(v)) ?? ''))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('allClients')}</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {locale === 'ar' ? c.name.ar : c.name.en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="hidden grow sm:block" />
        <button
          type="button"
          aria-pressed={mine}
          onClick={() => setMine((m) => !m)}
          className={cn(
            'flex h-7 items-center rounded-md px-2.5 text-[13px] leading-[18px] ring-1 transition-colors outline-none ring-inset focus-visible:ring-3 focus-visible:ring-ring/50',
            mine ? 'bg-neutral-100 ring-neutral-400' : 'ring-neutral-200 hover:bg-neutral-50',
          )}
        >
          {t('mine')}
        </button>
      </div>

      {error && <LoadError message={error} onRetry={() => void load()} />}

      {!loaded ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-xl bg-card px-6 py-16 text-center ring-1 ring-foreground/10">
          <span className="text-base leading-6 font-medium">
            {view === 'open' ? t('emptyTitle') : t('emptyFinishedTitle')}
          </span>
          <span className="text-sm leading-5 text-muted-foreground">
            {pool.length > 0
              ? t('emptyFiltered')
              : view === 'open'
                ? t('emptyAll')
                : t('emptyFinished')}
          </span>
        </div>
      ) : view === 'finished' ? (
        monthsOf(shown).map(({ key, label, items }) => (
          <section
            key={key}
            aria-labelledby={`month-${key}`}
            className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
          >
            <div className="flex items-center gap-2.5 bg-neutral-50 px-4 py-3">
              <h2 id={`month-${key}`} className="text-sm leading-5 font-medium">
                {label}
              </h2>
              <span className="font-mono text-xs text-muted-foreground">{items.length}</span>
            </div>
            {items.map((i) => (
              <FinishedRow
                key={`${i.kind}-${i.id}`}
                item={i}
                staff={staff}
                onOpen={() => setOpenKey(`${i.kind}-${i.id}`)}
              />
            ))}
          </section>
        ))
      ) : (
        BANDS.map((b) => {
          const items = shown.filter((i) => bandOf(i.due) === b);
          if (items.length === 0) return null;
          const h = BAND_HEAD[b];
          return (
            <section
              key={b}
              aria-labelledby={`band-${b}`}
              className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
            >
              <div className={cn('flex flex-wrap items-center gap-2.5 px-4 py-3', h.bg)}>
                <span aria-hidden className={cn('size-[7px] shrink-0 rounded-full', h.dot)} />
                <h2 id={`band-${b}`} className={cn('text-sm leading-5 font-medium', h.text)}>
                  {t(`band.${b}`)}
                </h2>
                <span className="font-mono text-xs text-muted-foreground">{items.length}</span>
                <span className="grow" />
                <span className="text-xs leading-4 text-muted-foreground">
                  {t(`bandNote.${b}`)}
                </span>
              </div>
              {items.map((i) => (
                <QueueRow
                  key={`${i.kind}-${i.id}`}
                  item={i}
                  staff={staff}
                  onChanged={load}
                  onOpen={() => setOpenKey(`${i.kind}-${i.id}`)}
                />
              ))}
            </section>
          );
        })
      )}

      {loaded && !canReadAllTasks && (
        <p className="text-xs leading-4 text-muted-foreground">{t('tasksOwnNote')}</p>
      )}

      <WorkItemDialog
        item={[...all, ...finished].find((i) => `${i.kind}-${i.id}` === openKey) ?? null}
        staff={staff}
        onChanged={load}
        onClose={() => setOpenKey(null)}
      />
      <NewTaskDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        clients={clients}
        onCreated={() => void load()}
      />
    </div>
  );
}
