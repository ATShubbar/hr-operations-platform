'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { GripVertical } from 'lucide-react';
import type {
  CandidateListResponse,
  CandidateResponse,
  CandidateStage,
  ClientListResponse,
  ClientResponse,
  VacancyListResponse,
  VacancyResponse,
  VacancyStatus,
} from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { toneFor } from '@/lib/status-tone';
import { useNationalityName } from '@/lib/nationality';
import type { Locale } from '@/lib/employee-format';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoadError, NoAccess } from '@/components/ui/load-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { toastSuccess } from '@/components/ui/toast';
import { AddCandidateDialog, type RoleSummary } from './add-candidate-dialog';
import { CandidateDialog, type CandidateView } from './candidate-dialog';
import { OpenRoleDialog } from './open-role-dialog';
import { COLUMNS, canDrop, isActive, nextOf, type Column } from './stages';

// Hiring (DS-09) — the prototype's Hiring screen (ADR-012): the open roles above
// the candidate board. It replaces REC-06's two screens (/vacancies, /candidates),
// which now redirect here.
//
// Over the existing APIs: a role is a vacancy (REC-02), a card a candidate
// (REC-04). The board's moves are the candidate workflow — one step forward, or
// (DS-09) one step back — by button, by the dialog, or by dragging a card onto
// the next or previous column; any other column refuses the drop. Moving an Offer
// to Onboarded is the hire (REC-05: it creates the employee record), so it asks
// first. The prototype's "Visa & mobilisation" column is shown, marked "coming
// soon": the onboarding feature does not exist yet.
//
// Roles: the board needs candidate.read; a client manager holds vacancy.read only
// (the matrix keeps candidates from clients), so they see their open roles and no
// board. The Auditor reads both: no grip, no moves, no buttons.

const ROLE_STATUSES: readonly VacancyStatus[] = ['open', 'draft', 'filled'];
// Column dots, the prototype's ramp: greys deepening along the pipeline, then the
// visa stage amber and onboarded green.
const DOT: Record<Column, string> = {
  applied: 'bg-neutral-300',
  screening: 'bg-neutral-400',
  interview: 'bg-neutral-500',
  offer: 'bg-neutral-700',
  visa: 'bg-status-warning',
  hired: 'bg-status-ok',
};

const daysSince = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

export default function HiringPage() {
  const t = useTranslations('hiring');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const nationalityName = useNationalityName(locale);
  const canReadCandidates = useCan('candidate.read');
  const canAdvance = useCan('candidate.advance');
  const canAddCandidate = useCan('candidate.create');
  const canApproveRole = useCan('vacancy.approve');
  const canOpenRole = useCan('vacancy.create') && canApproveRole;

  const [vacancies, setVacancies] = useState<VacancyResponse[]>([]);
  const [candidates, setCandidates] = useState<CandidateResponse[]>([]);
  const [clients, setClients] = useState<ClientResponse[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const [openRole, setOpenRole] = useState(false);
  const [addTo, setAddTo] = useState<RoleSummary | null>(null);
  const [openCand, setOpenCand] = useState<string | null>(null);
  const [confirmHire, setConfirmHire] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [moveError, setMoveError] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  // Legality is judged from a REF set synchronously in dragstart: the first
  // dragover can arrive before React re-renders with `dragId`, and a column that
  // does not preventDefault on it never receives the drop (measured: a quick drag
  // sent ONE dragover and was refused). State only drives the visuals.
  const dragRef = useRef<string | null>(null);
  const [overCol, setOverCol] = useState<Column | null>(null);

  async function load() {
    setError('');
    try {
      const [v, c] = await Promise.all([
        apiFetch<VacancyListResponse>('/vacancies'),
        canReadCandidates
          ? apiFetch<CandidateListResponse>('/candidates')
          : Promise.resolve({ candidates: [] }),
      ]);
      setVacancies(v.vacancies);
      setCandidates(c.candidates);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setError(t('loadError'));
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void load();
    // Company names. A client manager cannot list clients, so their cards simply
    // show the department — every role on their screen is their own company's.
    apiFetch<ClientListResponse>('/clients')
      .then((r) => setClients(r.clients))
      .catch(() => setClients([]));
  }, []);

  const clientName = (id: string) => {
    const c = clients.find((x) => x.id === id);
    return c ? (locale === 'ar' ? c.name.ar : c.name.en) : '';
  };
  const titleOf = (v: VacancyResponse | undefined) =>
    v ? (locale === 'ar' ? v.title.ar : v.title.en) : '';
  const vacancyOf = (id: string) => vacancies.find((v) => v.id === id);
  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return locale === 'ar'
      ? new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
      : `${d.getDate()} ${new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d)} ${d.getFullYear()}`;
  };

  const board = useMemo(() => candidates.filter((c) => isActive(c.stage)), [candidates]);
  const roles = useMemo(
    () =>
      vacancies
        .filter((v) => ROLE_STATUSES.includes(v.status))
        .sort(
          (a, b) =>
            ROLE_STATUSES.indexOf(a.status) - ROLE_STATUSES.indexOf(b.status) ||
            b.createdAt.localeCompare(a.createdAt),
        ),
    [vacancies],
  );

  const view = (c: CandidateResponse): CandidateView => {
    const v = vacancyOf(c.vacancyId);
    return {
      id: c.id,
      name: locale === 'ar' ? c.name.ar : c.name.en,
      nameAr: c.name.ar,
      role: titleOf(v),
      department: v?.department ?? null,
      client: clientName(c.clientId),
      nationality: nationalityName(c.nationality),
      stage: c.stage,
      notes: c.notes,
      added: formatDate(c.createdAt),
    };
  };
  const byId = (id: string | null) => candidates.find((c) => c.id === id) ?? null;

  // ---- moves ----
  async function move(c: CandidateResponse, to: CandidateStage) {
    // Onboarding creates the employee record and cannot be undone: ask first.
    if (to === 'hired' && confirmHire !== c.id) return setConfirmHire(c.id);
    setBusy(true);
    setMoveError('');
    const name = locale === 'ar' ? c.name.ar : c.name.en;
    try {
      await apiFetch(`/candidates/${c.id}/stage`, {
        method: 'POST',
        body: JSON.stringify({ stage: to }),
      });
      setConfirmHire(null);
      if (!isActive(to)) setOpenCand(null);
      await load();
      toastSuccess(
        to === 'hired'
          ? t('onboarded', { name })
          : isActive(to)
            ? t('moved', { name, stage: t(`column.${to}`) })
            : t(`ended.${to}`, { name }),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setMoveError(to === 'hired' && !c.nationality ? t('hireNeedsNationality') : t('moveError'));
    } finally {
      setBusy(false);
    }
  }

  async function setRoleStatus(v: VacancyResponse, status: VacancyStatus) {
    setBusy(true);
    setMoveError('');
    try {
      await apiFetch(`/vacancies/${v.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      await load();
      toastSuccess(t(`roleToast.${status}`, { title: titleOf(v) }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setMoveError(t('moveError'));
    } finally {
      setBusy(false);
    }
  }

  const clientCount = new Set(board.map((c) => c.clientId)).size;
  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
      <div className="flex min-w-0 grow flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        {loaded && (
          <p className="text-sm text-muted-foreground">
            {canReadCandidates
              ? [
                  t('summary', { count: board.length }),
                  t('summaryClients', { count: clientCount }),
                  ...(canAdvance ? [t('summaryDrag')] : []),
                ].join(' · ')
              : t('summaryRoles', { count: roles.length })}
          </p>
        )}
      </div>
      {canOpenRole && (
        <Button
          size="sm"
          onClick={() => setOpenRole(true)}
          className="shrink-0 self-start sm:self-auto"
        >
          {t('openRole')}
        </Button>
      )}
    </div>
  );

  if (forbidden) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <NoAccess capability="vacancy.read" />
      </div>
    );
  }

  const hireCandidate = byId(confirmHire);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {header}
      {error && (
        <LoadError message={error} onRetry={() => void load()} hasContent={vacancies.length > 0} />
      )}
      {moveError && (
        <p role="alert" className="text-sm text-destructive">
          {moveError}
        </p>
      )}

      {!loaded ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-36 w-full rounded-xl" />
          <div className="flex gap-3 overflow-hidden">
            {COLUMNS.map((c) => (
              <Skeleton key={c} className="h-80 w-[276px] shrink-0 rounded-xl" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* ---- open roles ---- */}
          {roles.length > 0 && (
            <section
              aria-labelledby="open-roles"
              className="flex flex-col gap-2.5 rounded-xl bg-card px-4 py-3.5 ring-1 ring-foreground/10"
            >
              <div className="flex flex-col gap-px">
                <h2 id="open-roles" className="text-[15px] leading-[22px] font-medium">
                  {t('openRoles')}
                </h2>
                <p className="text-xs leading-4 text-muted-foreground">
                  {canAddCandidate ? t('openRolesHint') : t('openRolesHintRead')}
                </p>
              </div>
              <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {roles.map((v) => {
                  const linked = candidates.filter((c) => c.vacancyId === v.id);
                  const hired = linked.filter((c) => c.stage === 'hired').length;
                  const live = linked.filter(
                    (c) => isActive(c.stage) && c.stage !== 'hired',
                  ).length;
                  const reached = hired >= v.headcount;
                  const days = daysSince(v.createdAt);
                  const close: VacancyStatus | null =
                    v.status === 'filled' || (v.status === 'open' && reached)
                      ? 'closed'
                      : 'cancelled';
                  return (
                    <li
                      key={v.id}
                      className="flex flex-col gap-2 rounded-lg bg-neutral-50 px-3.5 py-3 ring-1 ring-foreground/10"
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex min-w-0 grow flex-col gap-px">
                          <span className="truncate text-[13px] leading-[18px] font-medium">
                            {titleOf(v)}
                          </span>
                          <span className="truncate text-[11px] leading-[15px] text-muted-foreground">
                            {[clientName(v.clientId), v.department].filter(Boolean).join(' · ')}
                          </span>
                        </div>
                        <StatusPill tone={toneFor('vacancy', v.status)} className="shrink-0">
                          {t(`roleStatus.${v.status}`)}
                        </StatusPill>
                      </div>
                      {canReadCandidates && (
                        <div className="flex items-baseline gap-2 text-[11px] leading-[15px] text-muted-foreground">
                          <span className="grow">
                            {live + hired === 0
                              ? t('noCandidatesYet')
                              : [
                                  t('inPipeline', { count: live }),
                                  ...(hired ? [t('onboardedCount', { count: hired })] : []),
                                ].join(' · ')}
                          </span>
                          <span className="font-mono" title={t('filledOf')}>
                            {hired}/{v.headcount}
                          </span>
                        </div>
                      )}
                      <span className="text-[11px] leading-[15px] text-neutral-400">
                        {t('openFor', { days })}
                      </span>
                      {(canAddCandidate || canApproveRole) && (
                        <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
                          {canAddCandidate && v.status !== 'filled' && (
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() =>
                                setAddTo({
                                  id: v.id,
                                  title: titleOf(v),
                                  client: clientName(v.clientId),
                                  department: v.department,
                                })
                              }
                            >
                              {t('addCandidate')}
                            </Button>
                          )}
                          <span className="grow" />
                          {canApproveRole && v.status === 'draft' && (
                            <Button
                              variant="ghost"
                              size="xs"
                              disabled={busy}
                              onClick={() => void setRoleStatus(v, 'open')}
                            >
                              {t('publishRole')}
                            </Button>
                          )}
                          {canApproveRole && (
                            <Button
                              variant="ghost"
                              size="xs"
                              disabled={busy}
                              onClick={() => void setRoleStatus(v, close)}
                            >
                              {close === 'closed' ? t('closeRole') : t('withdrawRole')}
                            </Button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* ---- the board ---- */}
          {canReadCandidates && (
            <div
              role="region"
              aria-label={t('board')}
              // Keyboard-reachable: the board scrolls sideways on a narrow screen,
              // and a scroll area must take focus or its far columns are mouse-only
              // (UX-11).
              tabIndex={0}
              className="flex gap-3 overflow-x-auto pb-2 focus-visible:rounded-xl focus-visible:outline-2 focus-visible:outline-ring"
            >
              {COLUMNS.map((col) => {
                const items = col === 'visa' ? [] : board.filter((c) => c.stage === col);
                const visual = byId(dragId);
                const over = overCol === col && !!visual && canDrop(visual.stage, col);
                const draggedNow = () => byId(dragRef.current);
                const legalNow = () => {
                  const d = draggedNow();
                  return !!d && canDrop(d.stage, col);
                };
                return (
                  <section
                    key={col}
                    aria-labelledby={`col-${col}`}
                    className="flex w-[276px] shrink-0 flex-col"
                  >
                    <div className="flex items-center gap-2 px-1 pt-0.5 pb-2.5">
                      <span aria-hidden className={cn('size-2 shrink-0 rounded-full', DOT[col])} />
                      <h2
                        id={`col-${col}`}
                        className={cn(
                          'grow truncate text-[13px] leading-[18px] font-medium',
                          col === 'visa' && 'text-status-warning',
                        )}
                      >
                        {t(`column.${col}`)}
                      </h2>
                      {col === 'visa' ? (
                        <Badge variant="outline">{t('soon')}</Badge>
                      ) : (
                        <Badge variant="outline">{items.length}</Badge>
                      )}
                    </div>
                    <div
                      // Only a legal column accepts: cancelling dragenter AND
                      // dragover is what makes it a drop target (HTML DnD), so an
                      // illegal one shows the browser's "not allowed" and never
                      // receives the drop. Both, because a fast drag can enter a
                      // column and release before any dragover fires there.
                      onDragEnter={(e) => {
                        if (!legalNow()) return;
                        e.preventDefault();
                        if (overCol !== col) setOverCol(col);
                      }}
                      onDragOver={(e) => {
                        if (!legalNow()) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (overCol !== col) setOverCol(col);
                      }}
                      onDragLeave={(e) => {
                        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                        if (overCol === col) setOverCol(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const d = draggedNow();
                        const ok = legalNow();
                        dragRef.current = null;
                        setOverCol(null);
                        setDragId(null);
                        if (d && ok && col !== 'visa') void move(d, col);
                      }}
                      className={cn(
                        'flex min-h-80 grow flex-col gap-2.5 rounded-xl p-2 transition-colors',
                        over ? 'bg-neutral-100 ring-1 ring-neutral-400 ring-inset' : '',
                      )}
                    >
                      {items.map((c) => {
                        const cv = view(c);
                        const next = nextOf(c.stage);
                        return (
                          <article
                            key={c.id}
                            draggable={canAdvance}
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/plain', c.id);
                              dragRef.current = c.id;
                              setDragId(c.id);
                            }}
                            onDragEnd={() => {
                              dragRef.current = null;
                              setDragId(null);
                              setOverCol(null);
                            }}
                            className={cn(
                              'relative flex flex-col gap-2.5 rounded-xl bg-card p-3 ring-1 ring-foreground/10 transition-shadow hover:ring-foreground/20',
                              canAdvance && 'cursor-grab',
                              dragId === c.id && 'opacity-40',
                            )}
                          >
                            <div className="flex items-start gap-2.5">
                              <div className="flex min-w-0 grow flex-col gap-1">
                                {cv.client && (
                                  <Badge variant="secondary" className="max-w-full rounded-md">
                                    <span className="truncate">{cv.client}</span>
                                  </Badge>
                                )}
                                {/* The name opens the dialog; its ::after stretches
                                    over the card so the whole card is the target,
                                    with one real button for keyboard and AT. */}
                                <button
                                  type="button"
                                  onClick={() => setOpenCand(c.id)}
                                  className="truncate text-start text-sm leading-[19px] font-medium after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-ring"
                                >
                                  {cv.name}
                                </button>
                                <span className="truncate text-[11px] leading-[15px] text-muted-foreground">
                                  {[cv.role, cv.nationality].filter(Boolean).join(' · ')}
                                </span>
                              </div>
                              <span className="flex shrink-0 items-center gap-1">
                                <Avatar name={cv.name} size="sm" />
                                {canAdvance && (
                                  <GripVertical aria-hidden className="size-3.5 text-neutral-300" />
                                )}
                              </span>
                            </div>
                            <span className="text-[11px] leading-[15px] text-pretty text-muted-foreground">
                              {c.notes || t('addedAgo', { days: daysSince(c.createdAt) })}
                            </span>
                            {canAdvance && next && (
                              <Button
                                variant="outline"
                                size="xs"
                                disabled={busy}
                                // Above the stretched name button, so it stays its own target.
                                className="relative z-10 w-full"
                                onClick={() => void move(c, next)}
                              >
                                {t('moveForward')}
                              </Button>
                            )}
                          </article>
                        );
                      })}
                      {items.length === 0 && (
                        <div className="flex min-h-22 items-center justify-center rounded-xl bg-neutral-50 px-3 text-center text-xs leading-4 text-neutral-400">
                          {col === 'visa'
                            ? t('visaSoon')
                            : canAdvance
                              ? t('dropHere')
                              : t('nothingHere')}
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      <OpenRoleDialog
        open={openRole}
        onOpenChange={setOpenRole}
        clients={clients}
        onOpened={(r) => {
          void load();
          toastSuccess(t('roleOpened', { title: r.title, client: r.client, count: r.headcount }));
        }}
      />
      <AddCandidateDialog
        role={addTo}
        onOpenChange={(o) => !o && setAddTo(null)}
        onAdded={(name) => {
          const title = addTo?.title ?? '';
          void load();
          toastSuccess(t('candidateAdded', { name, title }));
        }}
      />
      <CandidateDialog
        candidate={openCand && byId(openCand) ? view(byId(openCand)!) : null}
        canAdvance={canAdvance}
        busy={busy}
        onClose={() => setOpenCand(null)}
        onMove={(to) => {
          const c = byId(openCand);
          if (c) void move(c, to);
        }}
      />
      <Dialog open={hireCandidate !== null} onOpenChange={(o) => !o && setConfirmHire(null)}>
        <DialogContent className="sm:max-w-[440px]">
          {hireCandidate && (
            <>
              <DialogHeader>
                <DialogTitle>{t('hireTitle', { name: view(hireCandidate).name })}</DialogTitle>
                <DialogDescription>
                  {hireCandidate.nationality
                    ? t('hireBody', {
                        name: view(hireCandidate).name,
                        client: view(hireCandidate).client || t('theClient'),
                      })
                    : t('hireNeedsNationality')}
                </DialogDescription>
              </DialogHeader>
              {moveError && <p className="text-sm text-destructive">{moveError}</p>}
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmHire(null)}>
                  {t('cancel')}
                </Button>
                <Button
                  disabled={busy || !hireCandidate.nationality}
                  onClick={() => void move(hireCandidate, 'hired')}
                >
                  {t('hireConfirm')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
