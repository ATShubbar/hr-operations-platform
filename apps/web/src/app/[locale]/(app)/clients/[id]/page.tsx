'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Ellipsis } from 'lucide-react';
import type {
  ClientResponse,
  EmployeeListResponse,
  EmployeeResponse,
  GroProcessListResponse,
  GroProcessResponse,
  RequestListResponse,
  RequestResponse,
} from '@hr/contracts';
import { Link, useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { toneFor } from '@/lib/status-tone';
import type { Locale } from '@/lib/employee-format';
import { useRecordLabel } from '@/components/header-location';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError, NoAccess } from '@/components/ui/load-state';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs';
import { toastSuccess } from '@/components/ui/toast';
import { StartProcedureDialog } from '../../employees/[id]/start-procedure-dialog';
import { BandPill, ProfileLine } from '@/components/client-profile-bits';
import { ClientFormDialog } from '../client-form-dialog';
import { figuresFor } from '../client-figures';
import { PortalUsersDialog } from '../portal-users-dialog';
import { RecordsTab } from './records-tab';
import { HiringTab } from './hiring-tab';
import { OpenWorkTab } from './open-work-tab';
import { OverviewTab } from './overview-tab';
import { PeopleTab } from './people-tab';
import { RequestsTab } from './requests-tab';

// The Client record (DS-10) — the prototype's record page (ADR-012): a back
// link, a header card (both names, status, View register, Start a procedure),
// and eight tabs.
//
// Built: Overview and People (DS-10); Requests, Open work and Hiring (DS-11);
// Records' company documents (DS-22a). Fees, Commercial and the rest of Records
// need data a client does not store yet (contacts, signatories, registrations,
// service tier, billing) — the client profile and billing feature epics — so
// they are shown "coming soon" (owner rule).
//
// Kept although the prototype's header lacks them: Edit, Archive / Restore and
// Portal users, which lived in the old list's rows (CLIENT-04, ROLE-02). They sit
// behind a "more" menu so the header keeps the prototype's two buttons.

const TABS = [
  'overview',
  'people',
  'requests',
  'work',
  'hiring',
  'records',
  'fees',
  'commercial',
] as const;
type Tab = (typeof TABS)[number];
const BUILT = new Set<Tab>(['overview', 'people', 'requests', 'work', 'hiring', 'records']);

export default function ClientRecordPage() {
  const t = useTranslations('clients');
  const ts = useTranslations('states');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const canEdit = useCan('client.update');
  const canArchive = useCan('client.delete');
  const canPortalUsers = useCan('client-user.read');
  const canStartProcedure = useCan('gro.process');
  const canReadCandidates = useCan('candidate.read');

  const [client, setClient] = useState<ClientResponse | null>(null);
  const [employees, setEmployees] = useState<EmployeeResponse[]>([]);
  const [processes, setProcesses] = useState<GroProcessResponse[]>([]);
  const [requests, setRequests] = useState<RequestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  // The HTTP status decides the state: a 404 won't become findable by retrying,
  // a 403 won't become permitted (UX-06).
  const [status, setStatus] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [moreOpen, setMoreOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  const [procOpen, setProcOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useRecordLabel(client ? (locale === 'ar' ? client.name.ar : client.name.en) : null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const c = await apiFetch<ClientResponse>(`/clients/${id}`);
      setClient(c);
      // The figures' sources are not fatal: the record still renders without them.
      const q = `?clientId=${id}`;
      const [e, g, r] = await Promise.all([
        apiFetch<EmployeeListResponse>(`/employees${q}`).catch(() => ({ employees: [] })),
        apiFetch<GroProcessListResponse>(`/gro-processes${q}`).catch(() => ({ processes: [] })),
        apiFetch<RequestListResponse>(`/requests${q}`).catch(() => ({ requests: [] })),
      ]);
      setEmployees(e.employees);
      setProcesses(g.processes);
      setRequests(r.requests);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setStatus(err instanceof ApiError ? err.status : 0);
      setError(err instanceof ApiError && err.status === 404 ? t('notFound') : t('error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  // A procedure moved on in Open work: refetch the company's processes (and, for a
  // completion that wrote an expiry back, its people) without the page skeleton.
  async function reloadWork() {
    const q = `?clientId=${id}`;
    const [e, g] = await Promise.all([
      apiFetch<EmployeeListResponse>(`/employees${q}`).catch(() => ({ employees })),
      apiFetch<GroProcessListResponse>(`/gro-processes${q}`).catch(() => ({ processes })),
    ]);
    setEmployees(e.employees);
    setProcesses(g.processes);
  }

  const staff = useMemo(
    () => employees.filter((e) => e.employmentStatus !== 'terminated'),
    [employees],
  );
  const figures = useMemo(
    () => figuresFor(id, employees, processes, requests),
    [id, employees, processes, requests],
  );

  async function setArchived(archive: boolean) {
    if (!client) return;
    setMoreOpen(false);
    setBusy(true);
    try {
      const saved = archive
        ? await apiFetch<ClientResponse>(`/clients/${client.id}`, { method: 'DELETE' })
        : await apiFetch<ClientResponse>(`/clients/${client.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'active' }),
          });
      setClient(saved);
      toastSuccess(t(archive ? 'archived' : 'restored', { name: saved.name.en }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t(archive ? 'archiveError' : 'saveError'));
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <Link
      href="/clients"
      className="inline-flex w-fit items-center gap-1.5 text-[13px] leading-[18px] text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      {t('back')}
    </Link>
  );

  if (loading && !client) {
    return (
      <SkeletonRegion label={ts('loading')} className="flex max-w-[1240px] flex-col gap-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-8 w-full" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-[86px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </SkeletonRegion>
    );
  }
  if (!client) {
    return (
      <div className="flex max-w-[1240px] flex-col gap-4">
        {back}
        {status === 403 ? (
          <NoAccess capability="client.read" />
        ) : status === 404 ? (
          <EmptyState variant="error" title={t('notFound')} />
        ) : (
          <LoadError message={error} onRetry={() => void load()} />
        )}
      </div>
    );
  }

  const name = locale === 'ar' ? client.name.ar : client.name.en;
  const isActive = client.status === 'active';
  const more = [
    canEdit && {
      key: 'edit',
      label: t('edit'),
      run: () => (setMoreOpen(false), setEditOpen(true)),
    },
    canPortalUsers && {
      key: 'portal',
      label: t('portalUsers'),
      run: () => (setMoreOpen(false), setPortalOpen(true)),
    },
    canArchive &&
      isActive && { key: 'archive', label: t('archive'), run: () => void setArchived(true) },
    canEdit &&
      !isActive && { key: 'restore', label: t('restore'), run: () => void setArchived(false) },
  ].filter(Boolean) as { key: string; label: string; run: () => void }[];

  return (
    <div className="flex max-w-[1240px] flex-col gap-4">
      {back}

      <div className="flex flex-col gap-4 rounded-xl bg-card px-5 py-[18px] ring-1 ring-foreground/10 sm:flex-row sm:items-start">
        <div className="flex min-w-0 grow flex-col gap-[3px]">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[22px] leading-[30px] font-semibold tracking-[-0.01em]">
              {client.name.en}
            </h1>
            {/* The band beside the name, as the prototype has it; an archived
                company also says so (the card has one slot, the header has room). */}
            <BandPill band={client.nitaqat?.band} />
            {!isActive && (
              <StatusPill tone={toneFor('client', client.status)}>{t('statusInactive')}</StatusPill>
            )}
          </div>
          {/* The prototype: direction rtl, aligned left — the END of an rtl box. */}
          <span
            dir="rtl"
            className="w-fit text-end text-[13px] leading-[18px] text-muted-foreground"
          >
            {client.name.ar}
          </span>
          <ProfileLine client={client} className="text-[13px] leading-[18px]" />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={`/employees?client=${client.id}`} />}
          >
            {t('viewRegister')}
          </Button>
          {canStartProcedure && isActive && (
            <Button size="sm" onClick={() => setProcOpen(true)} disabled={staff.length === 0}>
              {t('startProcedure')}
            </Button>
          )}
          {more.length > 0 && (
            <Popover open={moreOpen} onOpenChange={setMoreOpen}>
              <PopoverTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('moreActions')}
                    disabled={busy}
                  />
                }
              >
                <Ellipsis />
              </PopoverTrigger>
              <PopoverContent className="w-48 p-1">
                <ul className="flex flex-col">
                  {more.map((m) => (
                    <li key={m.key}>
                      <button
                        type="button"
                        onClick={m.run}
                        className="w-full rounded-md px-2.5 py-1.5 text-start text-[13px] leading-[18px] hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                      >
                        {m.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {error && <LoadError message={error} onRetry={() => void load()} hasContent />}

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-4">
        <TabsList aria-label={name}>
          {TABS.map((k) => (
            <TabsTab key={k} value={k}>
              {t(`tab.${k}`)}
            </TabsTab>
          ))}
        </TabsList>

        <TabsPanel value="overview">
          <OverviewTab client={client} onClientSaved={setClient} figures={figures} staff={staff} />
        </TabsPanel>

        <TabsPanel value="people">
          <PeopleTab staff={staff} clientId={client.id} />
        </TabsPanel>

        <TabsPanel value="requests">
          <RequestsTab requests={requests} />
        </TabsPanel>

        <TabsPanel value="work">
          <OpenWorkTab
            clientId={client.id}
            processes={processes}
            employees={employees}
            onChanged={reloadWork}
          />
        </TabsPanel>

        <TabsPanel value="hiring">
          {canReadCandidates ? (
            <HiringTab clientId={client.id} />
          ) : (
            <NoAccess capability="candidate.read" />
          )}
        </TabsPanel>

        <TabsPanel value="records">
          <RecordsTab client={client} onClientSaved={setClient} />
        </TabsPanel>

        {TABS.filter((k) => !BUILT.has(k)).map((k) => (
          <TabsPanel key={k} value={k}>
            <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
              <EmptyState
                variant="first-run"
                title={ts('comingSoon')}
                description={t(`soon.${k}`)}
              />
            </div>
          </TabsPanel>
        ))}
      </Tabs>

      {canEdit && (
        <ClientFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          client={client}
          onSaved={(saved) => {
            setClient(saved);
            toastSuccess(t('saved', { name: saved.name.en }));
          }}
        />
      )}
      {canPortalUsers && (
        <PortalUsersDialog
          client={portalOpen ? client : null}
          onClose={() => setPortalOpen(false)}
        />
      )}
      {canStartProcedure && (
        <StartProcedureDialog
          open={procOpen}
          onOpenChange={setProcOpen}
          context={name}
          bandFor={() => ({ client: name, nitaqat: client.nitaqat })}
          onStarted={() => void load()}
          choices={staff.map((e) => ({
            id: e.id,
            name: locale === 'ar' ? e.name.ar : e.name.en,
          }))}
        />
      )}
    </div>
  );
}
