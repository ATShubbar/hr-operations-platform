'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useMessages, useTranslations } from 'next-intl';
import type {
  ClientListResponse,
  ClientResponse,
  EmployeeHistoryEntry,
  EmployeeHistoryResponse,
  RequestListResponse,
  RequestResponse,
  RequestStatus,
  StaffDirectoryResponse,
} from '@hr/contracts';
import { formatHijri } from '@hr/dates';
import { matchesAnyField } from '@hr/text';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan, useSession } from '@/lib/session';
import { toneFor } from '@/lib/status-tone';
import type { Locale } from '@/lib/employee-format';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadError, NoAccess } from '@/components/ui/load-state';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusAction } from '@/components/ui/status-action';
import { StatusPill } from '@/components/ui/status-pill';
import { toastSuccess } from '@/components/ui/toast';
import { AskInfoDialog } from './ask-info-dialog';
import { InfoNeededBanner } from './info-needed-banner';
import { NewRequestDialog } from './new-request-dialog';
import { RequestThread } from './request-thread';

// Requests (DS-08) — the prototype's Requests screen (ADR-012): the list beside
// the selected request's detail.
//
// The prototype's decisions map onto the existing workflow (REQ-03) rather than
// inventing one: "Approve and assign" = open → in_progress WITH an assignee, in
// one `process` call; "Decline" = → cancelled; "Ask for more detail" = →
// info_needed with a required note (THREAD-03 — the requester's reply returns it
// to where it was). The thread is ADR-016's (THREAD-01/02). What the workflow
// still does not have — withdrawing a decision, a service level — is shown,
// marked "coming soon" (owner rule). The decision trail is the request's curated history
// (GET /requests/:id/history: what, who, when — never values).
//
// Kept although the prototype's staff view lacks them, because the screen had
// them and they still matter: New request (request.create holders), a search +
// status filter above the list (requests accumulate), and the later workflow
// moves (resolve / close / reopen) once a request is past its decision.

const STATUSES = ['open', 'in_progress', 'info_needed', 'resolved', 'closed', 'cancelled'] as const;
const ALL = 'all';
const NEXT: Record<RequestStatus, readonly RequestStatus[]> = {
  open: ['in_progress', 'cancelled'],
  in_progress: ['resolved', 'cancelled'],
  // Staff move a waiting request on by hand; the requester's reply does it itself.
  info_needed: ['open', 'in_progress', 'cancelled'],
  resolved: ['closed', 'in_progress'],
  closed: [],
  cancelled: [],
};
// Who work can be handed to: the roles that act on requests (the Auditor reads).
const ASSIGNABLE = new Set(['administrator', 'hr_officer', 'gro_officer']);

export default function RequestsPage() {
  const t = useTranslations('requests');
  const tr = useTranslations('roles');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const canCreate = useCan('request.create');
  const canProcess = useCan('request.process');
  // ADR-016: post on the thread (the Auditor reads it only).
  const canComment = useCan('request.comment');
  // The decision trail is a staff surface (GET /requests/:id/history is staff-only).
  const isStaff = useSession().principalType === 'staff';

  const [requests, setRequests] = useState<RequestResponse[]>([]);
  const [clients, setClients] = useState<ClientResponse[]>([]);
  const [staff, setStaff] = useState<StaffDirectoryResponse['users']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [fStatus, setFStatus] = useState<string>(ALL);
  const [newOpen, setNewOpen] = useState(false);

  async function load(keep?: string) {
    setError('');
    try {
      const res = await apiFetch<RequestListResponse>('/requests');
      setRequests(res.requests);
      setSelected((cur) => keep ?? cur ?? res.requests[0]?.id ?? null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setError(t('error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // `?r=<id>` opens a specific request (read here, not via useSearchParams,
    // which would force a Suspense boundary on a statically prerendered page).
    void load(new URLSearchParams(window.location.search).get('r') ?? undefined);
    // Both lists are staff-only (a client manager gets 403) — don't ask (REQ-06).
    if (!isStaff) return;
    apiFetch<ClientListResponse>('/clients')
      .then((r) => setClients(r.clients))
      .catch(() => setClients([]));
    apiFetch<StaffDirectoryResponse>('/staff-users/directory')
      .then((r) => setStaff(r.users))
      .catch(() => setStaff([]));
  }, [isStaff]);

  // REQ-06: company names come from /clients, a STAFF list — a client manager
  // can't read it, and every request they see is their own company's anyway, so
  // for them the company is simply left out (it used to fall back to an id
  // fragment).
  const clientName = (id: string): string | null => {
    if (!isStaff) return null;
    const c = clients.find((x) => x.id === id);
    return c ? (locale === 'ar' ? c.name.ar : c.name.en) : id.slice(0, 8);
  };
  const staffName = (id: string | null) =>
    id ? (staff.find((u) => u.id === id)?.displayName ?? id.slice(0, 8)) : null;
  const staffRole = (id: string | null) => staff.find((u) => u.id === id)?.role ?? null;
  const requesterName = (r: RequestResponse) =>
    r.requester?.name ??
    (r.requester ? t(`requester.${r.requester.kind}`) : t('requester.unknown'));
  const day = (iso: string) => {
    const d = new Date(iso);
    if (locale === 'ar') {
      return new Intl.DateTimeFormat('ar', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(d);
    }
    return `${d.getDate()} ${new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d)} ${d.getFullYear()}`;
  };

  const list = useMemo(
    () =>
      requests
        .filter((r) => fStatus === ALL || r.status === fStatus)
        .filter((r) =>
          matchesAnyField(
            [r.title, t(`type.${r.type}`), requesterName(r), clientName(r.clientId) ?? ''],
            search,
          ),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [requests, fStatus, search, clients, locale],
  );
  const req = requests.find((r) => r.id === selected) ?? null;
  const awaiting = requests.filter((r) => r.status === 'open').length;

  // ---- decisions ----
  const [approveOpen, setApproveOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [decideError, setDecideError] = useState('');
  const [trailKey, setTrailKey] = useState(0);
  // Re-mounts the thread after asking — the note was posted to it server-side.
  const [threadKey, setThreadKey] = useState(0);

  // REQ-05: hand an approved request to someone else — its status stays.
  async function reassign(r: RequestResponse, assigneeUserId: string, name: string) {
    setDeciding(true);
    setDecideError('');
    setReassignOpen(false);
    try {
      await apiFetch(`/requests/${r.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ assigneeUserId }),
      });
      await load(r.id);
      setTrailKey((k) => k + 1);
      toastSuccess(t('reassigned', { name }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setDecideError(t('decideError'));
    } finally {
      setDeciding(false);
    }
  }

  async function process(
    r: RequestResponse,
    status: RequestStatus,
    assigneeUserId?: string,
    note?: string,
  ) {
    setDeciding(true);
    setDecideError('');
    try {
      await apiFetch(`/requests/${r.id}/process`, {
        method: 'POST',
        body: JSON.stringify({
          status,
          ...(assigneeUserId ? { assigneeUserId } : {}),
          ...(note ? { note } : {}),
        }),
      });
      setApproveOpen(false);
      setAskOpen(false);
      setThreadKey((k) => k + 1);
      await load(r.id);
      setTrailKey((k) => k + 1);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setDecideError(t('decideError'));
      return false;
    } finally {
      setDeciding(false);
    }
  }

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
      <div className="flex min-w-0 grow flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('summary', { count: awaiting })}</p>
      </div>
      {canCreate && (
        <Button
          size="sm"
          onClick={() => setNewOpen(true)}
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
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <NoAccess capability="request.read" />
      </div>
    );
  }

  return (
    <div className="flex max-w-[1240px] flex-col gap-4">
      {header}
      {error && (
        <LoadError message={error} onRetry={() => void load()} hasContent={requests.length > 0} />
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[340px_1fr]">
        {/* ---- list ---- */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchList')}
              aria-label={t('searchList')}
              className="h-7 min-w-0 grow text-sm"
            />
            <Select value={fStatus} onValueChange={(v) => setFStatus(v ?? ALL)}>
              <SelectTrigger size="sm" className="w-36 shrink-0" aria-label={t('filterStatus')}>
                <SelectValue>
                  {(v) => (v === ALL ? t('filterAllStatuses') : t(`status.${String(v)}`))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('filterAllStatuses')}</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`status.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            {loading &&
              [0, 1, 2, 3].map((i) => (
                <div key={i} className="px-3.5 py-3 shadow-[inset_0_-1px_0_var(--border)]">
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ))}
            {!loading && list.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                {requests.length === 0 ? t('noRequests') : t('noMatch')}
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
                        setApproveOpen(false);
                        setDecideError('');
                      }}
                      aria-current={on ? 'true' : undefined}
                      className={cn(
                        'flex w-full items-center gap-2.5 px-3.5 py-[11px] text-start shadow-[inset_0_-1px_0_var(--border)] transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/60',
                        on && 'bg-neutral-100 hover:bg-neutral-100',
                      )}
                    >
                      <Avatar name={requesterName(r)} size="sm" />
                      <span className="flex min-w-0 grow flex-col gap-px">
                        <span className="truncate text-[13px] leading-[18px] font-medium">
                          {r.title}
                        </span>
                        <span className="truncate text-[11px] leading-[15px] text-muted-foreground">
                          {requesterName(r)} · {day(r.createdAt)}
                        </span>
                      </span>
                      <StatusPill tone={toneFor('request', r.status)} className="shrink-0">
                        {t(`status.${r.status}`)}
                      </StatusPill>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* ---- detail ---- */}
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          {!req ? (
            <p className="px-6 py-16 text-center text-sm text-muted-foreground">
              {loading ? ' ' : t('selectOne')}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-start gap-3.5 p-5">
                <Avatar name={requesterName(req)} size="lg" />
                <div className="flex min-w-0 grow flex-col gap-[3px]">
                  <div className="flex flex-wrap items-center gap-x-2.5">
                    <h2 className="text-xl leading-7 font-semibold tracking-[-0.01em]">
                      {req.title}
                    </h2>
                    <bdi dir="ltr" className="font-mono text-xs text-neutral-400">
                      #{req.id.slice(0, 8).toUpperCase()}
                    </bdi>
                  </div>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {[
                      t(`type.${req.type}`),
                      requesterName(req),
                      req.requester ? t(`requester.${req.requester.kind}`) : null,
                      clientName(req.clientId),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <StatusPill tone={toneFor('request', req.status)}>
                  {t(`status.${req.status}`)}
                </StatusPill>
              </div>

              <dl className="grid grid-cols-1 border-y sm:grid-cols-3">
                <div className="flex flex-col gap-0.5 px-5 py-3">
                  <dt className="text-xs leading-4 text-muted-foreground">{t('submitted')}</dt>
                  <dd className="text-sm leading-5">{day(req.createdAt)}</dd>
                  <dd className="text-[11px] leading-[15px] text-neutral-400">
                    {formatHijri(new Date(req.createdAt), locale)}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5 border-t px-5 py-3 sm:border-t-0 sm:border-s">
                  <dt className="text-xs leading-4 text-muted-foreground">{t('due')}</dt>
                  <dd className="text-sm leading-5">
                    {req.dueDate ? day(req.dueDate) : t('notSet')}
                  </dd>
                  {req.dueDate && (
                    <dd className="text-[11px] leading-[15px] text-neutral-400">
                      {formatHijri(new Date(req.dueDate), locale)}
                    </dd>
                  )}
                  {/* THREAD-04: the type's turnaround — and the clock's pause while waiting. */}
                  {req.serviceLevelDays !== null && (
                    <dd className="text-[11px] leading-[15px] text-muted-foreground">
                      {req.status === 'info_needed'
                        ? t('slaPaused')
                        : t('sla', { count: req.serviceLevelDays })}
                    </dd>
                  )}
                </div>
                <div className="flex flex-col gap-0.5 border-t px-5 py-3 sm:border-t-0 sm:border-s">
                  <dt className="text-xs leading-4 text-muted-foreground">{t('priorityLabel')}</dt>
                  <dd className="text-sm leading-5">{t(`priority.${req.priority}`)}</dd>
                </div>
              </dl>

              <div className="flex flex-col gap-4 p-5">
                <p className="text-sm leading-[22px] text-pretty text-neutral-700">
                  {req.description || (
                    <span className="text-muted-foreground">{t('noDescription')}</span>
                  )}
                </p>

                {req.status === 'info_needed' && (
                  <InfoNeededBanner audience={isStaff ? 'staff' : 'requester'} />
                )}

                {/* The request thread (ADR-016). A reply from the requester's side
                    can return a waiting request, so it re-reads the request. */}
                <RequestThread
                  key={`thread-${req.id}-${threadKey}`}
                  base={`/requests/${req.id}`}
                  canPost={canComment}
                  onPosted={() => {
                    if (req.status === 'info_needed') {
                      void load(req.id);
                      setTrailKey((k) => k + 1);
                    }
                  }}
                />

                {decideError && (
                  <p role="alert" className="text-sm text-destructive">
                    {decideError}
                  </p>
                )}

                {canProcess && req.status === 'open' && (
                  <div className="flex flex-wrap gap-2">
                    <Popover open={approveOpen} onOpenChange={setApproveOpen}>
                      <PopoverTrigger render={<Button disabled={deciding} />}>
                        {t('approve')}
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-[292px] p-1">
                        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                          {t('approveMenu')}
                        </p>
                        <ul>
                          {staff
                            .filter((u) => ASSIGNABLE.has(u.role))
                            .map((u) => (
                              <li key={u.id}>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (await process(req, 'in_progress', u.id)) {
                                      toastSuccess(t('approved', { name: u.displayName ?? '' }));
                                    }
                                  }}
                                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-start outline-none hover:bg-accent focus-visible:bg-accent"
                                >
                                  <Avatar name={u.displayName} size="md" />
                                  <span className="flex min-w-0 grow flex-col gap-px">
                                    <span className="truncate text-[13px] leading-[17px] font-medium">
                                      {u.displayName ?? u.id.slice(0, 8)}
                                    </span>
                                    <span className="truncate text-[11px] leading-[15px] text-muted-foreground">
                                      {tr(u.role)}
                                    </span>
                                  </span>
                                </button>
                              </li>
                            ))}
                        </ul>
                      </PopoverContent>
                    </Popover>
                    <Button variant="outline" disabled={deciding} onClick={() => setAskOpen(true)}>
                      {t('askInfo')}
                    </Button>
                    <span className="grow" />
                    <Button
                      variant="outline"
                      disabled={deciding}
                      className="border-status-critical/30 text-status-critical hover:bg-status-critical-surface"
                      onClick={async () => {
                        if (await process(req, 'cancelled')) toastSuccess(t('declined'));
                      }}
                    >
                      {t('decline')}
                    </Button>
                  </div>
                )}

                {/* REQ-06: the staff directory is staff-only (UX-10b), so a client
                    manager learns THAT the team has it, not who. */}
                {req.assigneeUserId && req.status !== 'open' && !isStaff && (
                  <div className="flex flex-col gap-px rounded-md bg-neutral-50 px-3.5 py-3 ring-1 ring-foreground/10">
                    <span className="text-[13px] leading-[18px] font-medium">{t('withTeam')}</span>
                    <span className="text-xs leading-4 text-muted-foreground">
                      {t('withTeamSub')}
                    </span>
                  </div>
                )}
                {req.assigneeUserId && req.status !== 'open' && isStaff && (
                  <div className="flex flex-wrap items-center gap-3 rounded-md bg-neutral-50 px-3.5 py-3 ring-1 ring-foreground/10">
                    <Avatar name={staffName(req.assigneeUserId)} size="md" />
                    <span className="flex min-w-0 grow flex-col gap-px">
                      <span className="text-[13px] leading-[18px] font-medium">
                        {t('assignedTo', { name: staffName(req.assigneeUserId) ?? '' })}
                      </span>
                      <span className="text-xs leading-4 text-muted-foreground">
                        {t('assignedSub', {
                          role: staffRole(req.assigneeUserId)
                            ? tr(staffRole(req.assigneeUserId)!)
                            : '—',
                        })}
                      </span>
                    </span>
                    {canProcess &&
                      (req.status === 'in_progress' || req.status === 'info_needed') && (
                        <Popover open={reassignOpen} onOpenChange={setReassignOpen}>
                          <PopoverTrigger
                            render={<Button variant="outline" size="sm" disabled={deciding} />}
                          >
                            {t('reassign')}
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-[292px] p-1">
                            <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                              {t('reassignMenu')}
                            </p>
                            <ul>
                              {staff
                                .filter(
                                  (u) => ASSIGNABLE.has(u.role) && u.id !== req.assigneeUserId,
                                )
                                .map((u) => (
                                  <li key={u.id}>
                                    <button
                                      type="button"
                                      onClick={() => void reassign(req, u.id, u.displayName ?? '')}
                                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-start outline-none hover:bg-accent focus-visible:bg-accent"
                                    >
                                      <Avatar name={u.displayName} size="md" />
                                      <span className="flex min-w-0 grow flex-col gap-px">
                                        <span className="truncate text-[13px] leading-[17px] font-medium">
                                          {u.displayName ?? u.id.slice(0, 8)}
                                        </span>
                                        <span className="truncate text-[11px] leading-[15px] text-muted-foreground">
                                          {tr(u.role)}
                                        </span>
                                      </span>
                                    </button>
                                  </li>
                                ))}
                            </ul>
                          </PopoverContent>
                        </Popover>
                      )}
                    <Button variant="outline" size="sm" onClick={() => router.push('/queue')}>
                      {t('openQueue')}
                    </Button>
                  </div>
                )}

                {/* Past the decision, the rest of the workflow (REQ-03) stays reachable. */}
                {canProcess && req.status !== 'open' && NEXT[req.status].length > 0 && (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {req.status === 'in_progress' && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={deciding}
                        onClick={() => setAskOpen(true)}
                      >
                        {t('askInfo')}
                      </Button>
                    )}
                    <StatusAction
                      next={NEXT[req.status]}
                      onSelect={(s) => void process(req, s)}
                      label={(s) => t(`status.${s}`)}
                      placeholder={t('moveTo')}
                    />
                  </div>
                )}

                {isStaff && (
                  <DecisionTrail key={`trail-${req.id}-${trailKey}`} requestId={req.id} />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <AskInfoDialog
        open={askOpen}
        onOpenChange={(o) => {
          setAskOpen(o);
          if (!o) setDecideError('');
        }}
        busy={deciding}
        error={askOpen ? decideError : ''}
        onAsk={async (note) => {
          if (req && (await process(req, 'info_needed', undefined, note))) toastSuccess(t('asked'));
        }}
      />

      <NewRequestDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        clients={clients}
        onCreated={(id) => void load(id)}
      />
    </div>
  );
}

// The request's decision trail — the design system's Timeline over
// GET /requests/:id/history. Curated: what happened, who, when.
function DecisionTrail({ requestId }: { requestId: string }) {
  const t = useTranslations('requests');
  const tr = useTranslations('roles');
  const messages = useMessages() as { requests?: { trailAction?: Record<string, string> } };
  const locale = useLocale() as Locale;
  const [data, setData] = useState<EmployeeHistoryResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiFetch<EmployeeHistoryResponse>(`/requests/${requestId}/history`)
      .then(setData)
      .catch(() => setFailed(true));
  }, [requestId]);

  const when = (iso: string) => {
    const d = new Date(iso);
    const date =
      locale === 'ar'
        ? new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'short', year: 'numeric' }).format(
            d,
          )
        : `${d.getDate()} ${new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d)} ${d.getFullYear()}`;
    return `${date} · ${new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(d)}`;
  };
  const known = messages.requests?.trailAction ?? {};
  const title = (e: EmployeeHistoryEntry) =>
    known[e.action] ? t(`trailAction.${e.action}`) : e.action;
  const who = (e: EmployeeHistoryEntry) => {
    const role = e.actor?.role ? tr(e.actor.role) : null;
    if (e.actor?.name) return role ? t('trailBy', { name: e.actor.name, role }) : e.actor.name;
    return role ?? '';
  };
  const dot = (e: EmployeeHistoryEntry) =>
    e.action === 'create'
      ? ['bg-[rgb(23,23,23)]', 'bg-[rgba(23,23,23,0.2)]']
      : ['bg-[rgb(163,163,163)]', 'bg-[rgba(163,163,163,0.2)]'];

  return (
    <div className="border-t pt-1">
      <h3 className="pt-3 pb-2 text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
        {t('trail')}
      </h3>
      {failed && <p className="text-sm text-muted-foreground">{t('error')}</p>}
      {data && data.entries.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('trailEmpty')}</p>
      )}
      {data && data.entries.length > 0 && (
        <ol className="flex flex-col">
          {data.entries.map((e, i) => {
            const last = i === data.entries.length - 1;
            const [d, h] = dot(e);
            return (
              <li key={e.id} className="flex gap-4">
                <span className="flex w-3 shrink-0 flex-col items-center" aria-hidden>
                  <span
                    className={cn(
                      'mt-[3px] flex size-[18px] shrink-0 items-center justify-center rounded-full',
                      h,
                    )}
                  >
                    <span className={cn('size-3 rounded-full', d)} />
                  </span>
                  {!last && <span className="min-h-6 w-px grow bg-border" />}
                </span>
                <span className={cn('flex min-w-0 grow flex-col gap-0.5 pt-1', last ? '' : 'pb-3')}>
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-base leading-[22px] font-medium">{title(e)}</span>
                    <time dateTime={e.at} className="text-sm leading-5 text-muted-foreground">
                      {when(e.at)}
                    </time>
                  </span>
                  <span className="text-sm leading-5 text-muted-foreground">{who(e)}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {data && <p className="mt-3 text-xs text-muted-foreground">{t('trailSince')}</p>}
    </div>
  );
}
