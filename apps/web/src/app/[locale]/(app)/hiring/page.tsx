'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  CandidateListResponse,
  CandidateResponse,
  CandidateStage,
  ClientListResponse,
  ClientResponse,
  SequenceListResponse,
  VacancyListResponse,
  VacancyResponse,
  VacancyStatus,
} from '@hr/contracts';
import { matchesAnyField } from '@hr/text';
import { Link, useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { BandWarning, type BandSource } from '@/components/band-warning';
import { useCan } from '@/lib/session';
import { toneFor } from '@/lib/status-tone';
import { useNationalityName } from '@/lib/nationality';
import type { Locale } from '@/lib/employee-format';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { StatusPill } from '@/components/ui/status-pill';
import { toastError, toastSuccess } from '@/components/ui/toast';
import { AddCandidateDialog, type RoleSummary } from './add-candidate-dialog';
import { CandidateDialog, type CandidateView } from './candidate-dialog';
import { HealthPill, useCandidateHealth } from './candidate-health';
import { OpenRoleDialog } from './open-role-dialog';
import { StagePill } from './stage-pill';
import { COLUMNS, forwardOf, isActive, isSaudi, type Column } from './stages';
import { dateFormat } from '@/lib/dates';
import { dots } from '@/lib/pieces';

// Hiring — the roles being recruited for and their candidates, over the existing
// APIs: a role is a vacancy (REC-02), a row a candidate (REC-04).
//
// HIRING-01 (ADR-012 rev. 2, owner decisions): the page is ONE SHEET of
// candidates, in the app's own theme — it replaced the prototype's six-column
// board (DS-09). A candidate is a row: names, nationality, stage (a soft-coloured
// pill), health and target date, how long since they were added. A switch
// arranges them under their role — the heading carries what the old roles strip
// carried, actions included — or as one list, where the role is a column.
//
// Every move the board allowed is still here, by button: one step forward on the
// row, and everything else (one step back, not selected, withdrew, the target
// date) in the candidate's window. Dragging went with the columns.
//
// Moving an Offer to Onboarded is the hire (REC-05: it creates the employee
// record), so it asks first. Visa & mobilisation (MOB-04b, ADR-018) is a real
// stage: an Offer for someone coming from abroad moves there — which creates
// their employee record as `onboarding` and starts their onboarding sequence, so
// it asks first too. A mobilising candidate shows how far the onboarding has got
// and links to the person's Mobilisation tab; nobody moves them on by hand —
// filing the last onboarding step carries the candidate to Onboarded. They can
// still be withdrawn or not selected (which cancels the onboarding and
// terminates the record). A Saudi national is never offered that stage; anyone
// at Offer may be onboarded directly instead.
//
// Roles: the sheet needs candidate.read; a client manager holds vacancy.read only
// (the matrix keeps candidates from clients), so they see their roles and no
// candidates. The Auditor reads both: no moves, no buttons.

const ROLE_STATUSES: readonly VacancyStatus[] = ['open', 'draft', 'filled'];
const ALL = 'all';
// The Stage filter's last choice: the candidates who left the pipeline.
const ENDED = 'ended';
const STAGE_ORDER: readonly CandidateStage[] = [...COLUMNS, 'rejected', 'withdrawn'];
const SORTS = ['target', 'stage', 'newest'] as const;
type SortKey = (typeof SORTS)[number];
// Remembered on this device: a convenience, never something the page depends on.
const ARRANGE_KEY = 'hiring.arrange';

// The sheet's columns from `lg` up; below it a candidate is a stacked block.
// By role: the role is the heading. One list: the role is a column.
const GROUPED_COLS =
  'lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1.7fr)_minmax(0,1.5fr)_minmax(0,1.3fr)] lg:items-center lg:gap-4';
const FLAT_COLS =
  'lg:grid lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,1.3fr)_minmax(0,1.2fr)] lg:items-center lg:gap-3';

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
  const canEditCandidate = useCan('candidate.update');
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
  // The two moves that create an employee record ask first.
  const [confirmMove, setConfirmMove] = useState<{
    id: string;
    to: 'hired' | 'mobilisation';
  } | null>(null);
  const canReadGro = useCan('gro.read');
  // Onboarding progress of the candidates in Visa & mobilisation, by employee id.
  const [progress, setProgress] = useState<Record<string, { done: number; total: number }>>({});
  const [busy, setBusy] = useState(false);
  const [moveError, setMoveError] = useState('');
  const [search, setSearch] = useState('');
  const [fClient, setFClient] = useState<string>(ALL);
  const [fStage, setFStage] = useState<string>(ALL);
  const [sort, setSort] = useState<SortKey>('target');
  const [pickRole, setPickRole] = useState(false);
  // Under each role, or one list. Opens by role; the last choice is remembered
  // on this device (read after mount, so the server and the first paint agree).
  const [grouped, setGrouped] = useState(true);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(ARRANGE_KEY) === 'flat') setGrouped(false);
    } catch {
      // No storage (a private window): the page opens by role.
    }
  }, []);
  const arrange = (value: boolean) => {
    setGrouped(value);
    try {
      window.localStorage.setItem(ARRANGE_KEY, value ? 'grouped' : 'flat');
    } catch {
      // Not remembered; nothing else depends on it.
    }
  };

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
      void loadProgress(c.candidates);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setError(t('loadError'));
    } finally {
      setLoaded(true);
    }
  }

  // How far each mobilising hire's onboarding has got (MOB-04b) — one small read
  // per card in the column, for those who may read sequences. Best effort: a card
  // without it still links to the record.
  async function loadProgress(list: CandidateResponse[]) {
    if (!canReadGro) return;
    const mobilising = list.filter((c) => c.stage === 'mobilisation' && c.employeeId);
    const entries = await Promise.all(
      mobilising.map(async (c) => {
        try {
          const res = await apiFetch<SequenceListResponse>(`/employees/${c.employeeId}/sequences`);
          const run =
            res.sequences.find((r) => r.kind === 'onboarding' && r.status === 'running') ??
            res.sequences.find((r) => r.kind === 'onboarding');
          if (!run) return null;
          return [
            c.employeeId!,
            { done: run.steps.filter((x) => x.state === 'filed').length, total: run.steps.length },
          ] as const;
        } catch {
          return null;
        }
      }),
    );
    setProgress(Object.fromEntries(entries.filter((e) => e !== null)));
  }

  useEffect(() => {
    void load();
    // Company names. A client manager cannot list clients, so their cards simply
    // show the department — every role on their screen is their own company's.
    apiFetch<ClientListResponse>('/clients')
      .then((r) => setClients(r.clients))
      .catch(() => setClients([]));
  }, []);

  const bandSourceOf = (id: string): BandSource | null => {
    const c = clients.find((x) => x.id === id);
    return c ? { client: locale === 'ar' ? c.name.ar : c.name.en, nitaqat: c.nitaqat } : null;
  };
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
      ? dateFormat('ar', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
      : `${d.getDate()} ${dateFormat('en-US', { month: 'short' }).format(d)} ${d.getFullYear()}`;
  };

  // A target date is a calendar DAY: worded in UTC so no timezone moves it.
  const formatDay = (ymd: string) =>
    dateFormat(locale === 'ar' ? 'ar' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${ymd}T00:00:00.000Z`));
  const healthOf = useCandidateHealth();

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
      nationalityCode: c.nationality,
      stage: c.stage,
      employeeId: c.employeeId,
      progress: c.employeeId ? (progress[c.employeeId] ?? null) : null,
      notes: c.notes,
      added: formatDate(c.createdAt),
      targetDate: c.targetDate,
      targetLabel: c.targetDate ? formatDay(c.targetDate) : null,
    };
  };
  const byId = (id: string | null) => candidates.find((c) => c.id === id) ?? null;

  // ---- the sheet: who is on it, and in what order ----
  const filtering = search.trim() !== '' || fStage !== ALL;
  const shown = useMemo(() => {
    // Soonest target first; then the people still in play without a date; then
    // those for whom nothing is left to be late for.
    const far = Number.MAX_SAFE_INTEGER;
    const urgency = (c: CandidateResponse) =>
      healthOf(c)?.daysToTarget ?? (c.stage === 'hired' || !isActive(c.stage) ? far : far - 1);
    const stageAt = (c: CandidateResponse) => STAGE_ORDER.indexOf(c.stage);
    const nameOf = (c: CandidateResponse) => (locale === 'ar' ? c.name.ar : c.name.en);
    return candidates
      .filter((c) =>
        // As the board did, people who left the pipeline are off the page — until
        // the Stage filter asks for them.
        fStage === ENDED
          ? !isActive(c.stage)
          : isActive(c.stage) && (fStage === ALL || c.stage === fStage),
      )
      .filter((c) => fClient === ALL || c.clientId === fClient)
      .filter((c) => {
        const v = vacancyOf(c.vacancyId);
        return matchesAnyField(
          [
            c.name.en,
            c.name.ar,
            v?.title.en ?? '',
            v?.title.ar ?? '',
            clientName(c.clientId),
            nationalityName(c.nationality),
          ],
          search,
        );
      })
      .sort((a, b) => {
        if (sort === 'newest') return b.createdAt.localeCompare(a.createdAt);
        if (sort === 'stage') {
          return (
            stageAt(a) - stageAt(b) ||
            urgency(a) - urgency(b) ||
            nameOf(a).localeCompare(nameOf(b), locale)
          );
        }
        return (
          urgency(a) - urgency(b) ||
          stageAt(b) - stageAt(a) ||
          nameOf(a).localeCompare(nameOf(b), locale)
        );
      });
    // healthOf/vacancyOf/clientName read the state listed here.
  }, [candidates, vacancies, clients, search, fClient, fStage, sort, locale]);

  // By role: every role being recruited for is a heading — an empty one too, so
  // a candidate can be added to it — followed by any other role one of the
  // candidates shown belongs to (a role that has since closed). While a search or
  // a stage filter is on, a heading with nobody under it is left out.
  const groups = useMemo(() => {
    if (!grouped) return [{ role: null as VacancyResponse | null, people: shown }];
    const inScope = (v: VacancyResponse) => fClient === ALL || v.clientId === fClient;
    const listed = roles.filter(inScope);
    const others = vacancies.filter(
      (v) => !listed.includes(v) && shown.some((c) => c.vacancyId === v.id),
    );
    return [...listed, ...others]
      .map((v) => ({
        role: v as VacancyResponse | null,
        people: shown.filter((c) => c.vacancyId === v.id),
      }))
      .filter((g) => g.people.length > 0 || (!filtering && listed.includes(g.role!)));
  }, [grouped, shown, roles, vacancies, fClient, filtering]);
  // Roles a candidate can be added to — for the One-list view, which has no headings.
  const addable = roles.filter((v) => v.status !== 'filled');
  const roleSummary = (v: VacancyResponse): RoleSummary => ({
    id: v.id,
    title: titleOf(v),
    client: clientName(v.clientId),
    department: v.department,
  });

  // SOON-04: record, change or clear a candidate's target date. The health on
  // the card and in the window follows from the date; nothing else is saved.
  async function setTarget(c: CandidateResponse, targetDate: string | null) {
    setBusy(true);
    try {
      const updated = await apiFetch<CandidateResponse>(`/candidates/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ targetDate }),
      });
      setCandidates((all) => all.map((x) => (x.id === updated.id ? updated : x)));
      toastSuccess(
        targetDate
          ? t('targetSaved', { name: view(updated).name, date: formatDay(targetDate) })
          : t('targetCleared', { name: view(updated).name }),
      );
    } catch {
      toastError(t('targetError'));
    } finally {
      setBusy(false);
    }
  }

  // ---- moves ----
  async function move(c: CandidateResponse, to: CandidateStage) {
    // Both of these create the employee record and cannot be undone: ask first.
    if (
      (to === 'hired' || to === 'mobilisation') &&
      !(confirmMove?.id === c.id && confirmMove.to === to)
    ) {
      return setConfirmMove({ id: c.id, to });
    }
    setBusy(true);
    setMoveError('');
    const name = locale === 'ar' ? c.name.ar : c.name.en;
    try {
      await apiFetch(`/candidates/${c.id}/stage`, {
        method: 'POST',
        body: JSON.stringify({ stage: to }),
      });
      setConfirmMove(null);
      if (!isActive(to)) setOpenCand(null);
      await load();
      toastSuccess(
        to === 'hired'
          ? t('onboarded', { name })
          : to === 'mobilisation'
            ? t('mobilised', { name })
            : isActive(to)
              ? t('moved', { name, stage: t(`column.${to}`) })
              : t(`ended.${to}`, { name }),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setMoveError(
        (to === 'hired' || to === 'mobilisation') && !c.nationality
          ? t('hireNeedsNationality')
          : t('moveError'),
      );
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
              ? dots(
                  locale,
                  t('summary', { count: board.length }),
                  t('summaryClients', { count: clientCount }),
                )
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

  const hireCandidate = byId(confirmMove?.id ?? null);
  const confirmTo = confirmMove?.to ?? 'hired';

  const COLS = grouped ? GROUPED_COLS : FLAT_COLS;
  // The companies that have a role — the Client filter offers no others.
  const roleClients = [...new Set(vacancies.map((v) => v.clientId))].sort((a, b) =>
    clientName(a).localeCompare(clientName(b), locale),
  );
  const stageLabel = (stage: CandidateStage) =>
    isActive(stage) ? t(`column.${stage as Column}`) : t(`end.${stage}`);

  // A role's heading: what the roles strip used to carry — where it stands, how
  // far it has got, and what can be done to it.
  const roleHeading = (v: VacancyResponse): ReactNode => {
    const linked = candidates.filter((c) => c.vacancyId === v.id);
    const hired = linked.filter((c) => c.stage === 'hired').length;
    const live = linked.filter((c) => isActive(c.stage) && c.stage !== 'hired').length;
    const reached = hired >= v.headcount;
    const close: VacancyStatus =
      v.status === 'filled' || (v.status === 'open' && reached) ? 'closed' : 'cancelled';
    // A role that is closed or withdrawn is only here because someone shown
    // belongs to it: it is named, and nothing more can be done to it.
    const current = ROLE_STATUSES.includes(v.status);
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-neutral-50 px-4 py-2 lg:border-t">
        <h2 className="max-w-full truncate text-[13px] leading-[18px] font-medium">{titleOf(v)}</h2>
        <span className="max-w-full truncate text-xs leading-4 text-muted-foreground">
          {dots(locale, clientName(v.clientId), v.department)}
        </span>
        <StatusPill tone={toneFor('vacancy', v.status)} className="shrink-0">
          {t(`roleStatus.${v.status}`)}
        </StatusPill>
        <span className="text-xs leading-4 text-muted-foreground">
          {live + hired === 0
            ? t('noCandidatesYet')
            : dots(
                locale,
                t('inPipeline', { count: live }),
                hired ? t('onboardedCount', { count: hired }) : null,
              )}
        </span>
        <span
          className="font-mono text-[11px] leading-[15px] text-muted-foreground"
          title={t('filledOf')}
        >
          {hired}/{v.headcount}
        </span>
        {current && (
          <span className="text-[11px] leading-[15px] text-neutral-400">
            {t('openFor', { days: daysSince(v.createdAt) })}
          </span>
        )}
        <span className="grow" />
        {current && (canAddCandidate || canApproveRole) && (
          <span className="flex flex-wrap items-center gap-1.5">
            {canAddCandidate && v.status !== 'filled' && (
              <Button variant="outline" size="xs" onClick={() => setAddTo(roleSummary(v))}>
                {t('addCandidate')}
              </Button>
            )}
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
          </span>
        )}
      </div>
    );
  };

  // A candidate's row. The NAME opens their window — its ::after stretches over
  // the row, so the whole row is the target with one real button for keyboard and
  // assistive tech; the move buttons sit above it and stay their own targets.
  const candidateRow = (c: CandidateResponse): ReactNode => {
    const cv = view(c);
    const forward = forwardOf(c.stage, c.nationality);
    const next = forward[0] ?? null;
    const direct = forward[1] ?? null;
    const h = healthOf(c);
    return (
      <li
        key={c.id}
        className={cn(
          'relative flex flex-col gap-2 border-t px-4 py-2.5 transition-colors hover:bg-muted/40',
          COLS,
        )}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={c.name.en} size="sm" />
          <span className="flex min-w-0 flex-col">
            <button
              type="button"
              onClick={() => setOpenCand(c.id)}
              className="truncate text-start text-sm leading-[19px] font-medium outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
            >
              {cv.name}
            </button>
            <span className="truncate text-xs leading-4 text-muted-foreground">
              {locale === 'ar' ? c.name.en : c.name.ar}
            </span>
          </span>
        </span>
        {!grouped && (
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] leading-[18px]">{cv.role || '—'}</span>
            <span className="truncate text-[11px] leading-[15px] text-muted-foreground">
              {cv.client}
            </span>
          </span>
        )}
        <span className="truncate text-[13px] leading-[18px] text-neutral-700">
          {cv.nationality || '—'}
        </span>
        <span className="min-w-0">
          <StagePill stage={c.stage} label={stageLabel(c.stage)} />
        </span>
        {/* SOON-04: the health worked out from the target date, and the date. */}
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {h && cv.targetLabel ? (
            <>
              <HealthPill health={h.health} label={h.label} />
              <span className="truncate text-[11px] leading-[15px] text-muted-foreground">
                {t('targetOn', { date: cv.targetLabel })}
              </span>
            </>
          ) : (
            <span className="text-[11px] leading-[15px] text-neutral-400">
              {cv.targetLabel
                ? t('targetOn', { date: cv.targetLabel })
                : isActive(c.stage) && c.stage !== 'hired'
                  ? t('healthNoTarget')
                  : '—'}
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] leading-[18px] text-neutral-700">
            {t('addedAgo', { days: daysSince(c.createdAt) })}
          </span>
          {c.notes && (
            <span className="truncate text-[11px] leading-[15px] text-muted-foreground">
              {c.notes}
            </span>
          )}
        </span>
        <span className="relative z-10 flex flex-wrap items-center gap-1.5 lg:justify-end">
          {c.stage === 'mobilisation' && c.employeeId && (
            // The work happens on the person's record: say how far it has got
            // and take the user there. Nobody moves a mobilising hire by hand.
            <>
              <span className="font-mono text-[11px] leading-[15px] text-neutral-700">
                {cv.progress
                  ? t('progress', { done: cv.progress.done, total: cv.progress.total })
                  : t('mobilisationRunning')}
              </span>
              <Button
                variant="outline"
                size="xs"
                nativeButton={false}
                render={<Link href={`/employees/${c.employeeId}?tab=mob`} />}
              >
                {t('openOnboarding')}
              </Button>
            </>
          )}
          {canAdvance && next && (
            <Button variant="outline" size="xs" disabled={busy} onClick={() => void move(c, next)}>
              {next === 'mobilisation' ? t('toMobilisation') : t('moveForward')}
            </Button>
          )}
          {canAdvance && direct && (
            <Button variant="ghost" size="xs" disabled={busy} onClick={() => void move(c, direct)}>
              {t('onboardDirectly')}
            </Button>
          )}
        </span>
      </li>
    );
  };

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
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-7 w-full max-w-xl rounded-lg" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      ) : !canReadCandidates ? (
        <>
          {/* A reader without candidates (a client manager) sees the roles and
              how far each has got — never who is in them. */}
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
                            {dots(locale, clientName(v.clientId), v.department)}
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
                              : dots(
                                  locale,
                                  t('inPipeline', { count: live }),
                                  hired ? t('onboardedCount', { count: hired }) : null,
                                )}
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
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              className="h-7 w-full text-sm sm:w-[260px]"
            />
            <Select value={fClient} onValueChange={(v) => setFClient(v ?? ALL)}>
              <SelectTrigger
                size="sm"
                className="w-full sm:w-[200px]"
                aria-label={t('filterClient')}
              >
                <SelectValue>
                  {(v) => (v === ALL ? t('allClients') : clientName(String(v)))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('allClients')}</SelectItem>
                {roleClients.map((id) => (
                  <SelectItem key={id} value={id}>
                    {clientName(id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fStage} onValueChange={(v) => setFStage(v ?? ALL)}>
              <SelectTrigger size="sm" className="w-full sm:w-[190px]" aria-label={t('factStage')}>
                <SelectValue>
                  {(v) =>
                    v === ALL
                      ? t('allStages')
                      : v === ENDED
                        ? t('notProgressing')
                        : t(`column.${String(v)}`)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('allStages')}</SelectItem>
                {COLUMNS.map((col) => (
                  <SelectItem key={col} value={col}>
                    {t(`column.${col}`)}
                  </SelectItem>
                ))}
                <SelectItem value={ENDED}>{t('notProgressing')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort((v as SortKey) ?? 'target')}>
              <SelectTrigger size="sm" className="w-full sm:w-[210px]" aria-label={t('sortBy')}>
                <SelectValue>{(v) => t('sortValue', { by: t(`sort.${String(v)}`) })}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(`sort.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* One list has no role headings to add from, so it asks which role. */}
            {!grouped && canAddCandidate && addable.length > 0 && (
              <Popover open={pickRole} onOpenChange={setPickRole}>
                <PopoverTrigger render={<Button variant="outline" size="sm" />}>
                  {t('addCandidate')}
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[300px] p-1">
                  <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    {t('addTo')}
                  </p>
                  <ul>
                    {addable.map((v) => (
                      <li key={v.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setPickRole(false);
                            setAddTo(roleSummary(v));
                          }}
                          className="flex w-full flex-col gap-px rounded-md px-2 py-1.5 text-start outline-none hover:bg-accent focus-visible:bg-accent"
                        >
                          <span className="truncate text-[13px] leading-[17px] font-medium">
                            {titleOf(v)}
                          </span>
                          <span className="truncate text-[11px] leading-[15px] text-muted-foreground">
                            {dots(locale, clientName(v.clientId), v.department)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </PopoverContent>
              </Popover>
            )}
            {/* Under each role, or one list across all of them. */}
            <div
              role="group"
              aria-label={t('arrange.label')}
              className="ms-auto inline-flex h-7 items-center rounded-lg bg-muted p-0.5"
            >
              {([true, false] as const).map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  aria-pressed={grouped === value}
                  onClick={() => arrange(value)}
                  className={cn(
                    'h-6 rounded-md px-2.5 text-xs leading-4 font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    grouped === value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {value ? t('arrange.byRole') : t('arrange.flat')}
                </button>
              ))}
            </div>
          </div>

          <div
            role="region"
            aria-label={t('sheet')}
            className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
          >
            <div
              className={cn(
                'hidden bg-neutral-100 px-4 py-2 text-xs leading-4 font-medium text-muted-foreground',
                COLS,
              )}
            >
              <span>{t('colCandidate')}</span>
              {!grouped && <span>{t('colRole')}</span>}
              <span>{t('factNationality')}</span>
              <span>{t('factStage')}</span>
              <span>{t('colHealth')}</span>
              <span>{t('colAdded')}</span>
              <span className="sr-only">{t('colActions')}</span>
            </div>
            {groups.map((group) => (
              <section
                key={group.role?.id ?? 'everyone'}
                className="border-t first:border-t-0 lg:border-t-0"
              >
                {group.role && roleHeading(group.role)}
                {group.people.length > 0 && <ul>{group.people.map((c) => candidateRow(c))}</ul>}
                {group.people.length === 0 && group.role && (
                  <p className="border-t px-4 py-3 text-xs leading-4 text-muted-foreground">
                    {t('noCandidatesYet')}
                  </p>
                )}
              </section>
            ))}
            {groups.every((g) => g.people.length === 0) && (!grouped || groups.length === 0) && (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {candidates.length === 0 ? t('noCandidatesYet') : t('noMatch')}
              </p>
            )}
          </div>
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
        canEdit={canEditCandidate}
        busy={busy}
        onClose={() => setOpenCand(null)}
        onSetTarget={(targetDate) => {
          const c = byId(openCand);
          if (c) void setTarget(c, targetDate);
        }}
        onMove={(to) => {
          const c = byId(openCand);
          if (c) void move(c, to);
        }}
      />
      <Dialog open={hireCandidate !== null} onOpenChange={(o) => !o && setConfirmMove(null)}>
        <DialogContent className="sm:max-w-[440px] [&>*]:min-w-0">
          {hireCandidate && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {t(confirmTo === 'mobilisation' ? 'mobiliseTitle' : 'hireTitle', {
                    name: view(hireCandidate).name,
                  })}
                </DialogTitle>
                <DialogDescription>
                  {hireCandidate.nationality
                    ? t(confirmTo === 'mobilisation' ? 'mobiliseBody' : 'hireBody', {
                        name: view(hireCandidate).name,
                        client: view(hireCandidate).client || t('theClient'),
                      })
                    : t('hireNeedsNationality')}
                </DialogDescription>
              </DialogHeader>
              {/* PROF-06: a Red or Yellow band at the employer warns about a
                  non-Saudi hire — here, where the move is confirmed — and
                  never blocks it. */}
              {hireCandidate.nationality && (
                <BandWarning
                  source={bandSourceOf(hireCandidate.clientId)}
                  check={{ kind: 'hire', saudi: isSaudi(hireCandidate.nationality) }}
                />
              )}
              {moveError && <p className="text-sm text-destructive">{moveError}</p>}
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmMove(null)}>
                  {t('cancel')}
                </Button>
                <Button
                  disabled={busy || !hireCandidate.nationality}
                  onClick={() => void move(hireCandidate, confirmTo)}
                >
                  {t(confirmTo === 'mobilisation' ? 'mobiliseConfirm' : 'hireConfirm')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
