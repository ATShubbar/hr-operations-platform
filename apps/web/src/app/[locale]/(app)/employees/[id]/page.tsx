'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import type { ClientResponse, EmployeeResponse } from '@hr/contracts';
import { Link, useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { toneFor } from '@/lib/status-tone';
import { EMPLOYMENT_STATUS_KEY, type Locale } from '@/lib/employee-format';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError, NoAccess } from '@/components/ui/load-state';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs';
import { useRecordLabel } from '@/components/header-location';
import { ProfileTab } from './profile-tab';
import { SelfServiceAccessCard } from './self-service-access-card';
import { StartProcedureDialog } from './start-procedure-dialog';

// The Person record (DS-06) — the prototype's record page (ADR-012): a back
// link, a header card (avatar, both names, status, a position · company ·
// department line, Start a procedure), and seven tabs.
//
// Built here: Profile. Family, Leave and Mobilisation have no backend and are
// shown "coming soon" (owner rule). Documents, Open work and History are the
// next card (DS-07); until then they say the same, so no tab is a dead click.
//
// Two things the prototype does not show are kept (owner decision): the
// employee's self-service access, as the last block of Profile, and Terminate,
// as a secondary header action for those holding employee.delete.

const TABS = ['profile', 'docs', 'family', 'leave', 'work', 'mob', 'history'] as const;
type Tab = (typeof TABS)[number];

export default function PersonRecordPage() {
  const t = useTranslations('person');
  const te = useTranslations('employees');
  const ts = useTranslations('states');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const canTerminate = useCan('employee.delete');
  const canSeeAccess = useCan('employee-user.read');
  const canStartProcedure = useCan('gro.process');

  const [emp, setEmp] = useState<EmployeeResponse | null>(null);
  const [client, setClient] = useState<ClientResponse | null>(null);
  const [loading, setLoading] = useState(true);
  // The HTTP status decides which state this is: a 404 will not become findable
  // by retrying, and a 403 will not become permitted (UX-06).
  const [status, setStatus] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('profile');
  const [procOpen, setProcOpen] = useState(false);
  const [terminating, setTerminating] = useState(false);

  useRecordLabel(emp ? (locale === 'ar' ? emp.name.ar : emp.name.en) : null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<EmployeeResponse>(`/employees/${id}`);
      setEmp(res);
      // The company's NAME for the header and the Employment section. Not fatal:
      // without it the record still renders, with a short id.
      apiFetch<ClientResponse>(`/clients/${res.clientId}`)
        .then(setClient)
        .catch(() => setClient(null));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setStatus(err instanceof ApiError ? err.status : 0);
      setError(err instanceof ApiError && err.status === 404 ? te('notFound') : te('error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function terminate() {
    if (!emp || !window.confirm(t('confirmTerminate'))) return;
    setTerminating(true);
    try {
      setEmp(await apiFetch<EmployeeResponse>(`/employees/${emp.id}`, { method: 'DELETE' }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(te('saveError'));
    } finally {
      setTerminating(false);
    }
  }

  const back = (
    <Link
      href="/employees"
      className="inline-flex w-fit items-center gap-1.5 text-[13px] leading-[18px] text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      {t('back')}
    </Link>
  );

  if (loading) {
    return (
      <SkeletonRegion label={ts('loading')} className="flex max-w-[1080px] flex-col gap-4">
        <Skeleton className="h-4 w-28" />
        <div className="flex items-center gap-4 rounded-xl p-5 ring-1 ring-foreground/10">
          <Skeleton className="size-14 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-48 w-full" />
      </SkeletonRegion>
    );
  }
  if (!emp) {
    return (
      <div className="flex max-w-[1080px] flex-col gap-4">
        {back}
        {status === 403 ? (
          <NoAccess capability="employee.read" />
        ) : status === 404 ? (
          <EmptyState variant="error" title={te('notFound')} />
        ) : (
          <LoadError message={error} onRetry={() => void load()} />
        )}
      </div>
    );
  }

  const clientName = client
    ? locale === 'ar'
      ? client.name.ar
      : client.name.en
    : emp.clientId.slice(0, 8);
  const position =
    (locale === 'ar' ? emp.jobTitle.ar : emp.jobTitle.en) ?? emp.jobTitle.en ?? emp.jobTitle.ar;
  const sub = [position, clientName, emp.department].filter(Boolean).join(' · ');
  const name = locale === 'ar' ? emp.name.ar : emp.name.en;

  return (
    <div className="flex max-w-[1080px] flex-col gap-4">
      {back}

      <div className="flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:flex-row sm:items-center">
        <div className="flex min-w-0 grow items-center gap-4">
          <Avatar name={emp.name.en} size="xl" />
          <div className="flex min-w-0 grow flex-col gap-[3px]">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold">{emp.name.en}</h1>
              <StatusPill tone={toneFor('employee', emp.employmentStatus)}>
                {te(EMPLOYMENT_STATUS_KEY[emp.employmentStatus])}
              </StatusPill>
            </div>
            {/* The prototype: direction rtl, aligned left — the END of an rtl box. */}
            <span dir="rtl" className="text-end text-sm leading-5 text-neutral-700">
              {emp.name.ar}
            </span>
            <span className="text-[13px] leading-[18px] text-muted-foreground">{sub}</span>
          </div>
        </div>
        {(canStartProcedure || (canTerminate && emp.employmentStatus !== 'terminated')) && (
          <span className="flex shrink-0 gap-2">
            {canTerminate && emp.employmentStatus !== 'terminated' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void terminate()}
                disabled={terminating}
              >
                {terminating ? t('terminating') : t('terminate')}
              </Button>
            )}
            {canStartProcedure && emp.employmentStatus !== 'terminated' && (
              <Button size="sm" onClick={() => setProcOpen(true)}>
                {t('startProcedure')}
              </Button>
            )}
          </span>
        )}
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

        <TabsPanel value="profile">
          <ProfileTab
            emp={emp}
            clientName={clientName}
            onSaved={setEmp}
            after={
              canSeeAccess ? (
                <SelfServiceAccessCard
                  employeeId={emp.id}
                  terminated={emp.employmentStatus === 'terminated'}
                />
              ) : undefined
            }
          />
        </TabsPanel>

        {TABS.filter((k) => k !== 'profile').map((k) => (
          <TabsPanel key={k} value={k}>
            <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
              <EmptyState
                variant="first-run"
                title={ts('comingSoon')}
                description={t(`soon.${k as Exclude<Tab, 'profile'>}`)}
              />
            </div>
          </TabsPanel>
        ))}
      </Tabs>

      {canStartProcedure && (
        <StartProcedureDialog
          open={procOpen}
          onOpenChange={setProcOpen}
          employeeId={emp.id}
          employeeName={name}
        />
      )}
    </div>
  );
}
