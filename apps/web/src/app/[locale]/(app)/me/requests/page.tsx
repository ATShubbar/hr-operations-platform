'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { SelfRequestListResponse, SelfRequestResponse } from '@hr/contracts';
import { apiFetch, ApiError } from '@/lib/api';
import { dualDate, type Locale } from '@/lib/employee-format';
import { toneFor } from '@/lib/status-tone';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError } from '@/components/ui/load-state';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { cn } from '@/lib/utils';
import { RequestThread } from '../../requests/request-thread';
import { RaiseRequestDialog } from '../raise-request-dialog';

// "My requests" (SS-07) — the requests THIS employee raised (the database
// returns only those, SS-05), newest first, and a way to raise another. A list
// of rows rather than a table: on a phone a table scrolls sideways, and each
// request is one title and one status. THREAD-01: a row opens the request — its
// details and its thread (comments both sides see, ADR-016); on a phone the
// detail stacks under the list.
export default function MyRequestsPage() {
  const t = useTranslations('me');
  const tReq = useTranslations('requests');
  const tStates = useTranslations('states');
  const locale = useLocale() as Locale;

  const [requests, setRequests] = useState<SelfRequestResponse[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'disabled' | 'error'>('loading');
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const res = await apiFetch<SelfRequestListResponse>('/me/requests');
      setRequests(res.requests);
      // `?r=<id>` opens one request (SEARCH-01 links here); else the newest.
      const wanted = new URLSearchParams(window.location.search).get('r');
      setSelected(
        (cur) =>
          cur ??
          (wanted && res.requests.some((x) => x.id === wanted)
            ? wanted
            : (res.requests[0]?.id ?? null)),
      );
      setState('ready');
    } catch (err) {
      setState(err instanceof ApiError && err.status === 403 ? 'disabled' : 'error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{t('myRequests')}</h1>
          <p className="text-sm text-muted-foreground">{t('requestsSubtitle')}</p>
        </div>
        {state === 'ready' && <Button onClick={() => setRaiseOpen(true)}>{t('raise')}</Button>}
      </div>
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}

      {state === 'loading' && (
        <SkeletonRegion label={tStates('loading')} className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </SkeletonRegion>
      )}
      {state === 'disabled' && (
        <EmptyState
          variant="restricted"
          title={t('notEnabledTitle')}
          description={t('notEnabled')}
        />
      )}
      {state === 'error' && <LoadError onRetry={() => void load()} />}
      {state === 'ready' && requests.length === 0 && (
        <EmptyState
          variant="first-run"
          title={t('noRequestsTitle')}
          description={t('noRequests')}
          action={<Button onClick={() => setRaiseOpen(true)}>{t('raise')}</Button>}
        />
      )}
      {state === 'ready' && requests.length > 0 && (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[340px_1fr]">
          <ul className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            {requests.map((r) => {
              const on = r.id === selected;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(r.id)}
                    aria-current={on ? 'true' : undefined}
                    className={cn(
                      'flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-start transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/60',
                      on && 'bg-neutral-100 hover:bg-neutral-100',
                    )}
                  >
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="truncate font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {tReq(`type.${r.type}`)} ·{' '}
                        {t('raisedOn', { date: dualDate(r.createdAt, locale) ?? '' })}
                      </p>
                    </div>
                    <StatusPill tone={toneFor('request', r.status)}>
                      {tReq(`status.${r.status}`)}
                    </StatusPill>
                  </button>
                </li>
              );
            })}
          </ul>

          {(() => {
            const r = requests.find((x) => x.id === selected);
            if (!r) return null;
            return (
              <div className="flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex min-w-0 grow flex-col gap-0.5">
                    <h2 className="text-lg leading-7 font-semibold text-pretty">{r.title}</h2>
                    <p className="text-[13px] leading-[18px] text-muted-foreground">
                      {tReq(`type.${r.type}`)} ·{' '}
                      {t('raisedOn', { date: dualDate(r.createdAt, locale) ?? '' })}
                    </p>
                  </div>
                  <StatusPill tone={toneFor('request', r.status)}>
                    {tReq(`status.${r.status}`)}
                  </StatusPill>
                </div>
                {r.description && (
                  <p className="text-sm leading-[22px] whitespace-pre-wrap text-pretty text-neutral-700">
                    {r.description}
                  </p>
                )}
                <RequestThread base={`/me/requests/${r.id}`} canPost />
              </div>
            );
          })()}
        </div>
      )}

      <RaiseRequestDialog
        open={raiseOpen}
        onOpenChange={setRaiseOpen}
        onRaised={(r) => {
          setRequests((prev) => [r, ...prev]);
          setSelected(r.id);
          setNotice(t('raised', { title: r.title }));
        }}
      />
    </div>
  );
}
