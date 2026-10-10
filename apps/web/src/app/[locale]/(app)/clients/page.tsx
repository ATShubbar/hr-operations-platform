'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  ClientListResponse,
  ClientResponse,
  EmployeeListResponse,
  GroProcessListResponse,
  RequestListResponse,
} from '@hr/contracts';
import { Link, useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { toneFor } from '@/lib/status-tone';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError, NoAccess } from '@/components/ui/load-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { toastSuccess } from '@/components/ui/toast';
import { BandPill, ProfileLine } from '@/components/client-profile-bits';
import { ClientFormDialog } from './client-form-dialog';
import { figuresFor, type ClientFigures } from './client-figures';
import { SaudiShare } from './saudi-share';

// Clients (DS-10) — the prototype's Clients screen (ADR-012): one card per
// company, opening its record.
//
// The card's figures are computed from what the screen can read: the employee records, GRO processes and
// requests (see client-figures.ts for what each one counts). Since PROF-02
// (ADR-019) the card carries the company's STORED Nitaqat band in the badge slot
// and its sector · city · CR line; an archived company shows "Archived" there
// instead. Edit, archive and portal users are in the record's header.
//
// The figures are computed in the browser from every employee, process and
// request — right at today's size, and the place a server-side summary goes the
// day a register outgrows it.

export default function ClientsPage() {
  const t = useTranslations('clients');
  const locale = useLocale();
  const router = useRouter();
  const canCreate = useCan('client.create');

  const [clients, setClients] = useState<ClientResponse[]>([]);
  const [figures, setFigures] = useState<Map<string, ClientFigures>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setError('');
    try {
      // The figures' sources are not fatal: without them a card still opens its
      // record, it just has nothing to count.
      const [c, e, g, r] = await Promise.all([
        apiFetch<ClientListResponse>('/clients'),
        apiFetch<EmployeeListResponse>('/employees').catch(() => ({ employees: [] })),
        apiFetch<GroProcessListResponse>('/gro-processes').catch(() => ({ processes: [] })),
        apiFetch<RequestListResponse>('/requests').catch(() => ({ requests: [] })),
      ]);
      setClients(c.clients);
      setFigures(
        new Map(
          c.clients.map((x) => [x.id, figuresFor(x.id, e.employees, g.processes, r.requests)]),
        ),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setError(t('error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const name = (c: ClientResponse) => (locale === 'ar' ? c.name.ar : c.name.en);
  // Active companies first, then by name; an archived one is history, not work.
  const sorted = useMemo(
    () =>
      [...clients].sort(
        (a, b) =>
          Number(a.status !== 'active') - Number(b.status !== 'active') ||
          name(a).localeCompare(name(b), locale),
      ),
    [clients, locale],
  );
  const active = clients.filter((c) => c.status === 'active').length;

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
      <div className="flex min-w-0 grow flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        {!loading && !forbidden && (
          <p className="text-sm text-muted-foreground">{t('summary', { count: active })}</p>
        )}
      </div>
      {canCreate && (
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
          className="shrink-0 self-start sm:self-auto"
        >
          {t('new')}
        </Button>
      )}
    </div>
  );

  if (forbidden) {
    return (
      <div className="flex max-w-[1240px] flex-col gap-4">
        {header}
        <NoAccess capability="client.read" />
      </div>
    );
  }

  return (
    <div className="flex max-w-[1240px] flex-col gap-4">
      {header}
      {error && (
        <LoadError message={error} onRetry={() => void load()} hasContent={clients.length > 0} />
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <EmptyState variant="first-run" title={t('empty')} />
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((c) => {
            const f = figures.get(c.id);
            const href = `/clients/${c.id}`;
            return (
              <li
                key={c.id}
                className="flex flex-col gap-3.5 rounded-xl bg-card p-[18px] ring-1 ring-foreground/10"
              >
                <div className="flex items-start gap-2.5">
                  <div className="flex min-w-0 grow flex-col gap-0.5">
                    <h2 className="text-base leading-[22px] font-medium text-pretty">
                      {c.name.en}
                    </h2>
                    {/* The prototype: direction rtl, aligned left — the END of an
                        rtl box. */}
                    <span dir="rtl" className="text-end text-xs leading-4 text-muted-foreground">
                      {c.name.ar}
                    </span>
                  </div>
                  {/* The band's slot. An archived company says so instead: its
                      band is history, and "archived" is what a reader needs. */}
                  {c.status === 'active' ? (
                    <BandPill band={c.nitaqat?.band} className="shrink-0" />
                  ) : (
                    <StatusPill tone={toneFor('client', c.status)} className="shrink-0">
                      {t('statusInactive')}
                    </StatusPill>
                  )}
                </div>
                <ProfileLine client={c} className="text-xs leading-4" />
                <SaudiShare pct={f?.saudiPct ?? 0} label={t('saudiShare')} band={c.nitaqat?.band} />
                <dl className="grid grid-cols-3 gap-2 border-t pt-3">
                  {(
                    [
                      ['headcount', f?.headcount],
                      ['expiring30', f?.expiring30],
                      ['openItems', f?.openItems],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="flex flex-col-reverse gap-px">
                      <dt className="text-[11px] leading-[15px] text-muted-foreground">
                        {t(`fig.${k}`)}
                      </dt>
                      <dd className="text-lg leading-6 font-semibold tabular-nums">{v ?? 0}</dd>
                    </div>
                  ))}
                </dl>
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={href} />}
                  aria-label={t('openRecordFor', { name: name(c) })}
                >
                  {t('openRecord')}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <ClientFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={(saved) => {
          toastSuccess(t('created', { name: name(saved) }));
          router.push(`/clients/${saved.id}`);
        }}
      />
    </div>
  );
}
