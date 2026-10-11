'use client';

import { useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { CandidateStage } from '@hr/contracts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Link } from '@/i18n/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { HealthPill, useCandidateHealth } from './candidate-health';
import { forwardOf, prevOf } from './stages';
import { dots } from '@/lib/pieces';

// The candidate's dialog (DS-09) — the prototype's drawer. SOON-04: Target is a
// date someone records; Health is WORKED OUT from it (owner decision), so there
// is nothing to keep up to date by hand. Documents and comments are the request
// thread's sibling and come with that feature.
//
// Not progressing (reject / withdrawn) is not in the prototype; the workflow has
// it and a board without it lets dead candidates pile up, so it stays — as a
// secondary action.

export interface CandidateView {
  id: string;
  name: string;
  nameAr: string;
  role: string;
  department: string | null;
  client: string;
  nationality: string;
  /** ISO code — the workflow asks it (a Saudi national skips mobilisation). */
  nationalityCode: string | null;
  stage: CandidateStage;
  /** Set once the candidate entered Visa & mobilisation (MOB-04b). */
  employeeId: string | null;
  /** Onboarding steps filed, when it is known to the viewer. */
  progress: { done: number; total: number } | null;
  notes: string | null;
  added: string;
  /** SOON-04: the day they are meant to be in post by (YYYY-MM-DD), or none. */
  targetDate: string | null;
  /** …and that day as the page words it. */
  targetLabel: string | null;
}

export function CandidateDialog({
  candidate,
  canAdvance,
  canEdit,
  busy,
  onClose,
  onMove,
  onSetTarget,
}: {
  candidate: CandidateView | null;
  canAdvance: boolean;
  busy: boolean;
  onClose: () => void;
  onMove: (to: CandidateStage) => void;
  /** May change the candidate (candidate.update): the target date is theirs to set. */
  canEdit: boolean;
  onSetTarget: (targetDate: string | null) => void;
}) {
  const t = useTranslations('hiring');
  const locale = useLocale();
  const [endOpen, setEndOpen] = useState(false);
  const healthOf = useCandidateHealth();
  // The target-date editor: closed until asked for, and reset for each candidate.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [seen, setSeen] = useState<string | null>(null);
  if ((candidate?.id ?? null) !== seen) {
    setSeen(candidate?.id ?? null);
    setEditing(false);
  }
  const c = candidate;
  const forward = c ? forwardOf(c.stage, c.nationalityCode) : [];
  const next = forward[0] ?? null;
  const direct = forward[1] ?? null; // from Offer: straight to Onboarded
  const prev = c ? prevOf(c.stage) : null;
  const mobilising = c?.stage === 'mobilisation';
  const health = c ? healthOf(c) : null;

  const fact = (label: string, value: ReactNode) => (
    <div className="flex flex-col gap-px">
      <span className="text-[11px] leading-[15px] text-muted-foreground">{label}</span>
      <span className="text-[13px] leading-[18px]">{value}</span>
    </div>
  );

  return (
    <Dialog open={c !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[620px]">
        {c && (
          <>
            <DialogHeader>
              <DialogTitle>{c.name}</DialogTitle>
              <DialogDescription>{dots(locale, c.role, c.client)}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md bg-neutral-50 px-3.5 py-3 ring-1 ring-foreground/10 sm:grid-cols-3">
                {fact(t('factStage'), t(`column.${c.stage}`))}
                {fact(t('factNationality'), c.nationality || '—')}
                {fact(t('factNameAr'), <span dir="rtl">{c.nameAr}</span>)}
                {fact(
                  t('factHealth'),
                  health ? (
                    <HealthPill health={health.health} label={health.label} />
                  ) : (
                    <span className="text-neutral-400">
                      {c.targetDate ? '—' : t('healthNoTarget')}
                    </span>
                  ),
                )}
                <div className="flex flex-col gap-px">
                  <span className="text-[11px] leading-[15px] text-muted-foreground">
                    {t('factTarget')}
                  </span>
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[13px] leading-[18px]">{c.targetLabel ?? '—'}</span>
                    {canEdit && !editing && (
                      <button
                        type="button"
                        className="text-[11px] leading-[15px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                        onClick={() => {
                          setDraft(c.targetDate ?? '');
                          setEditing(true);
                        }}
                      >
                        {c.targetDate ? t('targetChange') : t('targetSet')}
                      </button>
                    )}
                  </span>
                  {health && (
                    <span
                      className={cn(
                        'text-[10px] leading-[14px]',
                        health.health === 'past_target'
                          ? 'text-status-critical'
                          : health.health === 'at_risk'
                            ? 'text-status-warning'
                            : 'text-muted-foreground',
                      )}
                    >
                      {health.note}
                    </span>
                  )}
                </div>
                {fact(
                  t('factMobilisation'),
                  mobilising && c.progress
                    ? t('progress', { done: c.progress.done, total: c.progress.total })
                    : mobilising
                      ? t('mobilisationRunning')
                      : '—',
                )}
              </div>

              {editing && (
                <form
                  className="flex flex-wrap items-end gap-2 rounded-md px-3.5 py-3 ring-1 ring-foreground/10"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (draft) {
                      onSetTarget(draft);
                      setEditing(false);
                    }
                  }}
                >
                  <div className="flex min-w-0 grow flex-col gap-1.5">
                    <Label htmlFor="cd-target">{t('fieldTarget')}</Label>
                    <Input
                      id="cd-target"
                      type="date"
                      value={draft}
                      aria-describedby="cd-target-hint"
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <p id="cd-target-hint" className="text-xs leading-4 text-muted-foreground">
                      {t('targetHint')}
                    </p>
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={busy || !draft || draft === c.targetDate}
                  >
                    {t('targetSave')}
                  </Button>
                  {c.targetDate && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        onSetTarget(null);
                        setEditing(false);
                      }}
                    >
                      {t('targetClear')}
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                    {t('cancel')}
                  </Button>
                </form>
              )}

              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] leading-[18px] text-pretty text-neutral-700">
                  {dots(locale, c.notes, t('addedOn', { date: c.added }))}
                </span>
                <span className="text-xs leading-4 text-muted-foreground">
                  {t('againstRole', {
                    role: dots(locale, c.role, c.department),
                  })}
                </span>
              </div>

              <div className="flex flex-col gap-1 rounded-md px-3.5 py-3 ring-1 ring-foreground/10">
                <span className="text-[13px] leading-[18px] font-medium">
                  {t('documentsAndComments')}
                </span>
                <span className="text-xs leading-4 text-muted-foreground">{t('threadSoon')}</span>
              </div>
            </div>

            <DialogFooter className="items-center sm:justify-start">
              {canAdvance && prev && (
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => onMove(prev)}>
                  {t('backTo', { stage: t(`column.${prev}`) })}
                </Button>
              )}
              {canAdvance && (next || mobilising) && (
                <Popover open={endOpen} onOpenChange={setEndOpen}>
                  <PopoverTrigger render={<Button variant="ghost" size="sm" disabled={busy} />}>
                    {t('notProgressing')}
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-56 p-1">
                    <ul className="flex flex-col">
                      {(['rejected', 'withdrawn'] as const).map((s) => (
                        <li key={s}>
                          <button
                            type="button"
                            className="flex w-full flex-col items-start gap-px rounded-md px-2.5 py-2 text-start hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                            onClick={() => {
                              setEndOpen(false);
                              onMove(s);
                            }}
                          >
                            <span className="text-[13px] leading-[18px] font-medium">
                              {t(`end.${s}`)}
                            </span>
                            <span className="text-[11px] leading-[15px] text-muted-foreground">
                              {t(`endHint.${s}`)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </PopoverContent>
                </Popover>
              )}
              <span className="hidden grow sm:block" />
              {/* In mobilisation the work is the onboarding sequence, on the person's record. */}
              {mobilising && c.employeeId && (
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`/employees/${c.employeeId}?tab=mob`} />}
                >
                  {t('openOnboarding')}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onClose}>
                {t('close')}
              </Button>
              {canAdvance && direct && (
                <Button variant="outline" size="sm" disabled={busy} onClick={() => onMove(direct)}>
                  {t('onboardDirectly')}
                </Button>
              )}
              {canAdvance && next && (
                <Button size="sm" disabled={busy} onClick={() => onMove(next)}>
                  {t('moveTo', { stage: t(`column.${next}`) })}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
