'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  SequenceKind,
  SequenceListResponse,
  SequenceResponse,
  SequenceStep,
} from '@hr/contracts';
import { formatHijri } from '@hr/dates';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import type { Locale } from '@/lib/employee-format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadError, NoAccess } from '@/components/ui/load-state';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { toastError, toastSuccess } from '@/components/ui/toast';

// The Person record's Mobilisation tab (MOB-03, ADR-018) — the prototype's:
// "No sequence running" with Start onboarding / Start final exit, or the running
// (else the most recent) sequence: its label, when it started, what is next, how
// much is filed, then every step — number, title, "portal · note", what it waits
// on or when it was filed, its target date in both calendars, the standard fee
// (shown for information: recording fees is Billing's) and Mark filed / Blocked /
// Reopen.
//
// Staff only (the API refuses everyone else). Starting, filing, reopening and
// cancelling need gro.process; the Auditor reads. Step titles and notes arrive as
// KEYS and are translated here. A completed sequence offers no Reopen (MOB-04b).
// Refusals are explained in the user's language — the reopen rule is checked here
// first, from the step list's own `needs`, and the server stays the guard.

const KINDS: SequenceKind[] = ['onboarding', 'final_exit'];
const todayIso = () => new Date().toISOString().slice(0, 10);

const tone = (status: SequenceResponse['status']) =>
  status === 'completed' ? 'ok' : status === 'cancelled' ? 'neutral' : 'info';

export function MobilisationTab({
  employeeId,
  terminated,
  onEmployeeChanged,
}: {
  employeeId: string;
  terminated: boolean;
  /** A sequence COMPLETED — the person's status may have changed (MOB-04b/05). */
  onEmployeeChanged?: () => void;
}) {
  const t = useTranslations('person.mob');
  const ts = useTranslations('states');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const canProcess = useCan('gro.process');

  const [runs, setRuns] = useState<SequenceResponse[] | null>(null);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError('');
    try {
      const res = await apiFetch<SequenceListResponse>(`/employees/${employeeId}/sequences`);
      setRuns(res.sequences);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      if (err instanceof ApiError && err.status === 403) return setForbidden(true);
      setError(t('loadError'));
    }
  }
  useEffect(() => {
    void load();
  }, [employeeId]);

  const day = (iso: string) => {
    const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
    if (locale === 'ar') {
      return new Intl.DateTimeFormat('ar', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(d);
    }
    const month = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(d);
    return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
  };
  const hijri = (iso: string) => formatHijri(new Date(`${iso.slice(0, 10)}T00:00:00Z`), locale);
  const sar = (n: number) => new Intl.NumberFormat('en-US').format(n);
  const title = (key: string) => t(`step.${key}.title`);
  const list = (keys: string[]) => keys.map(title).join(t('and'));

  // The one shown in full: the running sequence, else the most recent.
  const current = runs?.find((r) => r.status === 'running') ?? runs?.[0] ?? null;
  const earlier = runs?.filter((r) => r !== current) ?? [];
  const running = runs?.filter((r) => r.status === 'running') ?? [];

  const replace = (updated: SequenceResponse) =>
    setRuns((prev) => (prev ? prev.map((r) => (r.id === updated.id ? updated : r)) : prev));

  /** A refusal the server sent although the screen allowed the action: explain, then refresh. */
  function refused(err: unknown, fallback: string) {
    if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
    toastError(err instanceof ApiError && err.status === 409 ? t('error.changed') : fallback);
    void load();
  }

  async function start(kind: SequenceKind) {
    setBusy(true);
    try {
      const run = await apiFetch<SequenceResponse>(`/employees/${employeeId}/sequences`, {
        method: 'POST',
        body: JSON.stringify({ kind }),
      });
      setRuns((prev) => [run, ...(prev ?? [])]);
      toastSuccess(t('toast.started', { label: t(`kind.${kind}.label`) }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      toastError(
        err instanceof ApiError && err.status === 409
          ? kind === 'final_exit' && running.some((r) => r.kind === 'onboarding')
            ? t('error.onboardingRunning')
            : t('error.duplicate')
          : err instanceof ApiError && err.status === 400
            ? t('error.terminated')
            : t('error.generic'),
      );
      void load();
    } finally {
      setBusy(false);
    }
  }

  // ---- mark filed ----
  const [filing, setFiling] = useState<{ run: SequenceResponse; step: SequenceStep } | null>(null);
  const [filedOn, setFiledOn] = useState('');
  const [fileError, setFileError] = useState('');
  const openFile = (run: SequenceResponse, step: SequenceStep) => {
    setFiledOn(todayIso());
    setFileError('');
    setFiling({ run, step });
  };
  async function submitFile() {
    if (!filing || !filedOn) return;
    if (filedOn > todayIso()) return setFileError(t('error.future'));
    setBusy(true);
    setFileError('');
    try {
      const updated = await apiFetch<SequenceResponse>(
        `/gro-sequences/${filing.run.id}/steps/${filing.step.key}/file`,
        { method: 'POST', body: JSON.stringify({ filedOn }) },
      );
      replace(updated);
      toastSuccess(t('toast.filed', { title: title(filing.step.key) }));
      setFiling(null);
      // Completing an onboarding makes the person active: let the record refresh.
      if (updated.status === 'completed') onEmployeeChanged?.();
    } catch (err) {
      setFiling(null);
      refused(err, t('error.generic'));
    } finally {
      setBusy(false);
    }
  }

  async function reopen(run: SequenceResponse, step: SequenceStep) {
    // The rule, checked here so it can be explained: nothing FILED may depend on it.
    const dependents = run.steps.filter((s) => s.state === 'filed' && s.needs.includes(step.key));
    if (dependents.length) {
      return toastError(t('error.dependents', { list: list(dependents.map((s) => s.key)) }));
    }
    setBusy(true);
    try {
      const updated = await apiFetch<SequenceResponse>(
        `/gro-sequences/${run.id}/steps/${step.key}/reopen`,
        { method: 'POST' },
      );
      replace(updated);
      toastSuccess(t('toast.reopened', { title: title(step.key) }));
    } catch (err) {
      refused(err, t('error.generic'));
    } finally {
      setBusy(false);
    }
  }

  // ---- cancel ----
  const [cancelling, setCancelling] = useState<SequenceResponse | null>(null);
  async function confirmCancel() {
    if (!cancelling) return;
    setBusy(true);
    try {
      const updated = await apiFetch<SequenceResponse>(`/gro-sequences/${cancelling.id}/cancel`, {
        method: 'POST',
      });
      replace(updated);
      toastSuccess(t('toast.cancelled', { label: t(`kind.${cancelling.kind}.label`) }));
      setCancelling(null);
    } catch (err) {
      setCancelling(null);
      refused(err, t('error.generic'));
    } finally {
      setBusy(false);
    }
  }

  if (forbidden) return <NoAccess capability="gro.read" />;

  const card = 'rounded-xl bg-card ring-1 ring-foreground/10';
  const startable = (kind: SequenceKind) =>
    canProcess &&
    !terminated &&
    !running.some((r) => r.kind === kind) &&
    !(kind === 'final_exit' && running.some((r) => r.kind === 'onboarding'));
  const startButtons = (
    <span className="flex flex-wrap justify-center gap-2">
      {KINDS.filter(startable).map((kind, i) => (
        <Button
          key={kind}
          size="sm"
          variant={i === 0 ? 'default' : 'outline'}
          disabled={busy}
          onClick={() => void start(kind)}
        >
          {t(`start.${kind}`)}
        </Button>
      ))}
    </span>
  );

  if (runs === null && !error) {
    return (
      <SkeletonRegion label={ts('loading')}>
        <Skeleton className="h-56 w-full rounded-xl" />
      </SkeletonRegion>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <LoadError message={error} onRetry={() => void load()} hasContent={!!runs?.length} />
      )}

      {/* Nothing running: the prototype's empty card — also shown above a finished
          sequence, so the next one can be started. */}
      {runs && running.length === 0 && (
        <div className={cn(card, 'flex flex-col items-center gap-3 px-6 py-10')}>
          <h2 className="text-base leading-6 font-medium">{t('noneTitle')}</h2>
          <p className="max-w-[460px] text-center text-[13px] leading-[18px] text-pretty text-muted-foreground">
            {t('noneBody')}
          </p>
          {startButtons}
        </div>
      )}

      {current && (
        <SequenceCard
          run={current}
          canProcess={canProcess}
          busy={busy}
          onFile={openFile}
          onReopen={(run, step) => void reopen(run, step)}
          onCancel={setCancelling}
          day={day}
          hijri={hijri}
          sar={sar}
          list={list}
        />
      )}

      {/* A final exit may be started while nothing but a finished run is shown; an
          onboarding may run beside nothing else — offered under a running one too. */}
      {runs && running.length > 0 && KINDS.some(startable) && (
        <div className={cn(card, 'flex items-center justify-end gap-2 px-5 py-3')}>
          {startButtons}
        </div>
      )}

      {earlier.length > 0 && (
        <section aria-labelledby="mob-earlier" className={cn(card, 'overflow-hidden')}>
          <h2 id="mob-earlier" className="px-5 py-3 text-sm leading-5 font-medium">
            {t('earlier')}
          </h2>
          <ul>
            {earlier.map((r) => (
              <li key={r.id} className="flex items-center gap-3 border-t px-5 py-2.5">
                <span className="min-w-0 grow text-[13px] leading-[18px]">
                  {t('earlierLine', {
                    label: t(`kind.${r.kind}.label`),
                    date: day(r.startedOn),
                  })}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {t('filedOf', {
                    done: r.steps.filter((s) => s.state === 'filed').length,
                    total: r.steps.length,
                  })}
                </span>
                <StatusPill tone={tone(r.status)} className="shrink-0">
                  {t(`status.${r.status}`)}
                </StatusPill>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- Mark filed ---- */}
      <Dialog open={filing !== null} onOpenChange={(o) => !o && setFiling(null)}>
        <DialogContent className="sm:max-w-[460px] [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>{t('fileTitle')}</DialogTitle>
            <DialogDescription>
              {filing ? `${title(filing.step.key)} · ${filing.step.portal}` : ''}
            </DialogDescription>
          </DialogHeader>
          {filing && (
            <div className="flex flex-col gap-3">
              <p className="text-xs leading-4 text-muted-foreground">
                {t('target', { date: day(filing.step.target) })} · {hijri(filing.step.target)}
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mob-filed-on">{t('fileOn')}</Label>
                <Input
                  id="mob-filed-on"
                  type="date"
                  max={todayIso()}
                  value={filedOn}
                  onChange={(e) => setFiledOn(e.target.value)}
                />
              </div>
              <p className="text-xs leading-4 text-muted-foreground">
                {filing.step.fee > 0
                  ? t('feeNote', { portal: filing.step.portal, amount: sar(filing.step.fee) })
                  : t('noFeeNote')}
              </p>
              {fileError && (
                <p role="alert" className="text-sm text-destructive">
                  {fileError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setFiling(null)}>
                  {t('close')}
                </Button>
                <Button size="sm" disabled={busy || !filedOn} onClick={() => void submitFile()}>
                  {busy ? t('saving') : t('markFiled')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ---- Cancel ---- */}
      <Dialog open={cancelling !== null} onOpenChange={(o) => !o && setCancelling(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{cancelling ? t(`cancelTitle.${cancelling.kind}`) : ''}</DialogTitle>
            <DialogDescription>{t('cancelBody')}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCancelling(null)}>
              {t('keep')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => void confirmCancel()}
            >
              {busy ? t('cancelling') : t('cancelConfirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SequenceCard({
  run,
  canProcess,
  busy,
  onFile,
  onReopen,
  onCancel,
  day,
  hijri,
  sar,
  list,
}: {
  run: SequenceResponse;
  canProcess: boolean;
  busy: boolean;
  onFile: (run: SequenceResponse, step: SequenceStep) => void;
  onReopen: (run: SequenceResponse, step: SequenceStep) => void;
  onCancel: (run: SequenceResponse) => void;
  day: (iso: string) => string;
  hijri: (iso: string) => string;
  sar: (n: number) => string;
  list: (keys: string[]) => string;
}) {
  const t = useTranslations('person.mob');
  const done = run.steps.filter((s) => s.state === 'filed').length;
  const blocked = run.steps.filter((s) => s.state === 'blocked').length;
  const next = run.steps.find((s) => s.state === 'ready');
  const pct = Math.round((done / run.steps.length) * 100);
  const live = run.status === 'running';
  // Only a RUNNING sequence can have a step reopened: a completed one is final —
  // both kinds (MOB-04b; its completion has made the person active, or MOB-05
  // terminated them) — and a cancelled one is closed.
  const reopenable = canProcess && live;

  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="flex flex-col gap-4 px-5 py-[18px] sm:flex-row sm:items-start">
        <span className="flex min-w-0 grow flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <h2 className="text-base leading-6 font-medium">{t(`kind.${run.kind}.label`)}</h2>
            {!live && <StatusPill tone={tone(run.status)}>{t(`status.${run.status}`)}</StatusPill>}
          </span>
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            <bdi>
              {t(`kind.${run.kind}.desc`)} {t('started', { date: day(run.startedOn) })}
            </bdi>
          </span>
          {live && (
            <span className="text-[13px] leading-[18px] text-neutral-700">
              <bdi>
                {next ? t('next', { title: t(`step.${next.key}.title`) }) : t('nothingWaiting')}
              </bdi>
            </span>
          )}
        </span>
        <span className="flex w-full shrink-0 flex-col gap-[5px] sm:w-[180px] sm:items-end">
          <span className="flex w-full items-baseline gap-2">
            <span className="grow text-[11px] leading-[15px] text-muted-foreground">
              {t('filedOf', { done, total: run.steps.length })}
            </span>
            <span className="font-mono text-xs">{pct}%</span>
          </span>
          <span
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('filedOf', { done, total: run.steps.length })}
            className="block h-2 w-full overflow-hidden rounded-full bg-neutral-100"
          >
            <span className="block h-2 rounded-full bg-neutral-900" style={{ width: `${pct}%` }} />
          </span>
          {live && (
            <span className="text-[11px] leading-[15px] text-muted-foreground">
              <bdi>{t('blockedCount', { count: blocked })}</bdi>
            </span>
          )}
          {live && canProcess && (
            <Button variant="ghost" size="xs" disabled={busy} onClick={() => onCancel(run)}>
              {t('cancel')}
            </Button>
          )}
        </span>
      </div>

      <ol>
        {run.steps.map((s, i) => (
          <li
            key={s.key}
            className={cn(
              'flex flex-wrap items-start gap-x-3 gap-y-1.5 border-t px-5 py-3 sm:flex-nowrap',
              live && s.state === 'ready' && 'bg-neutral-50',
            )}
          >
            <span className="flex w-[22px] shrink-0 flex-col items-center gap-1 pt-0.5">
              <span
                aria-hidden
                className={cn(
                  'size-2 rounded-full',
                  s.state === 'filed'
                    ? 'bg-status-ok'
                    : s.state === 'ready'
                      ? 'bg-neutral-900'
                      : 'bg-neutral-300',
                )}
              />
              <span className="font-mono text-[10px] text-neutral-400">
                {String(i + 1).padStart(2, '0')}
              </span>
            </span>
            <span className="flex min-w-0 grow basis-[calc(100%-34px)] flex-col gap-0.5 sm:basis-0">
              {/* Isolated: under the LTR layout (ADR-012) an Arabic line holding a
                  Latin word ("فحص GAMCA الطبي") or ending in a name is otherwise laid
                  out run by run, left to right. Each bdi sits inside a span, so its
                  direction never flips the line's alignment (THREAD-02). */}
              <span className="text-[13px] leading-[18px] font-medium">
                <bdi>{t(`step.${s.key}.title`)}</bdi>
              </span>
              <span className="text-[11px] leading-[15px] text-pretty text-muted-foreground">
                {s.portal} · <bdi>{t(`step.${s.key}.note`)}</bdi>
              </span>
              {live && s.state === 'blocked' && (
                <span className="text-[11px] leading-[15px] text-status-warning">
                  <bdi>{t('waitingOn', { list: list(s.waitingOn) })}</bdi>
                </span>
              )}
              {s.state === 'filed' && s.filedOn && (
                <span className="text-[11px] leading-[15px] text-status-ok">
                  <bdi>
                    {s.filedBy?.name
                      ? t('filedBy', { date: day(s.filedOn), name: s.filedBy.name })
                      : t('filedOn', { date: day(s.filedOn) })}
                  </bdi>
                </span>
              )}
            </span>
            <span className="ms-[34px] flex shrink-0 flex-col sm:ms-0 sm:w-[124px] sm:items-end">
              <span className="text-xs leading-4 whitespace-nowrap text-muted-foreground">
                <bdi>{t('target', { date: day(s.target) })}</bdi>
              </span>
              <span className="font-mono text-[10px] leading-[14px] whitespace-nowrap text-neutral-400">
                {hijri(s.target)}
              </span>
            </span>
            {/* On a phone the fee and the action share one end-aligned line (the
                button used to wrap alone to the start edge); from `sm` this wrapper
                dissolves into the prototype's 88px + 96px columns. */}
            <span className="flex shrink-0 grow items-center justify-end gap-3 sm:contents">
              <span className="flex shrink-0 items-center justify-end font-mono text-[11px] whitespace-nowrap text-neutral-500 sm:w-[88px]">
                {s.fee > 0 ? <bdi>{t('fee', { amount: sar(s.fee) })}</bdi> : t('noFee')}
              </span>
              <span className="flex shrink-0 items-center justify-end sm:w-24">
                {live && s.state === 'ready' && canProcess && (
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={busy}
                    onClick={() => onFile(run, s)}
                    aria-label={`${t('markFiled')} — ${t(`step.${s.key}.title`)}`}
                  >
                    {t('markFiled')}
                  </Button>
                )}
                {live && s.state === 'blocked' && (
                  <span className="text-[11px] whitespace-nowrap text-neutral-400">
                    {t('blocked')}
                  </span>
                )}
                {s.state === 'filed' && reopenable && (
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={busy}
                    onClick={() => onReopen(run, s)}
                    aria-label={`${t('reopen')} — ${t(`step.${s.key}.title`)}`}
                  >
                    {t('reopen')}
                  </Button>
                )}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
