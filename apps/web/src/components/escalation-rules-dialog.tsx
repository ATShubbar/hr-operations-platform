'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DEFAULT_ESCALATION_THRESHOLDS,
  ESCALATION_RULES,
  RULE_STAGES,
  STAGE_AUDIENCE,
  THRESHOLD_DAYS,
  thresholdOrderProblem,
  type EscalationRule,
  type EscalationStage,
  type EscalationThresholds,
  type ThresholdStage,
} from '@hr/contracts/escalation-rules';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toastSuccess } from '@/components/ui/toast';

// Escalation rules (NC-04, ADR-021) — the prototype's dialog: for each rule,
// when each stage starts and who it tells. Everyone with the ladder reads it;
// the Administrator (`config.write`) changes the day thresholds.
//
// What can and cannot change here:
//   · the DAYS at which Notice, Reminder and Escalated start — from a fixed
//     list, and a later stage may not start earlier than the one before it;
//   · Breach is fixed: the date has passed;
//   · WHO is told at each stage is fixed by ADR-021 and only shown.
//
// One deliberate difference from the prototype: it applies each change the
// moment a value is picked. This is a setting for the whole system — it moves
// what every person sees — so here the changes are made together and applied
// with Save, which also lets two stages of one rule be changed without passing
// through an order the server would refuse.

const KEY = 'escalation.thresholds';
const STAGE_DOT: Record<EscalationStage, string> = {
  breach: 'bg-status-critical',
  escalation: 'bg-status-warning',
  reminder: 'bg-neutral-500',
  notice: 'bg-neutral-400',
};
const same = (a: EscalationThresholds, b: EscalationThresholds) =>
  JSON.stringify(a) === JSON.stringify(b);

export function EscalationRulesDialog({
  open,
  onOpenChange,
  thresholds,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The thresholds in force. */
  thresholds: EscalationThresholds;
  onSaved: () => void;
}) {
  const t = useTranslations('notifications.rules');
  const tc = useTranslations('notifications.centre');
  const router = useRouter();
  const canEdit = useCan('config.write');
  const [draft, setDraft] = useState<EscalationThresholds>(thresholds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Start from what is in force each time the dialog opens (Base UI does not
  // call onOpenChange when the parent opens it — track it during render).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(thresholds);
      setError('');
    }
  }

  const problem = thresholdOrderProblem(draft);
  const changed = !same(draft, thresholds);
  const standard = same(draft, DEFAULT_ESCALATION_THRESHOLDS);

  const dayOf = (rule: EscalationRule, stage: ThresholdStage): number | undefined =>
    (draft[rule] as Partial<Record<ThresholdStage, number>>)[stage];
  function setDay(rule: EscalationRule, stage: ThresholdStage, value: number) {
    setError('');
    setDraft((d) => ({ ...d, [rule]: { ...d[rule], [stage]: value } }));
  }

  async function save() {
    if (problem || !changed) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/config/system/${KEY}`, {
        method: 'PATCH',
        body: JSON.stringify({ value: draft }),
      });
      onOpenChange(false);
      onSaved();
      toastSuccess(t('saved'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(
        err instanceof ApiError && err.status === 400 ? t('error.invalid') : t('error.save'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{canEdit ? t('noteAdmin') : t('noteReadOnly')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3.5">
          {ESCALATION_RULES.map((rule) => (
            <section
              key={rule}
              aria-labelledby={`er-${rule}`}
              className="overflow-hidden rounded-lg ring-1 ring-foreground/10"
            >
              <div className="flex flex-col gap-0.5 bg-neutral-50 px-3.5 py-[11px]">
                <h3 id={`er-${rule}`} className="text-sm leading-[19px] font-medium">
                  {t(`rule.${rule}.label`)}
                </h3>
                <p className="text-[11px] leading-[15px] text-muted-foreground">
                  <span>
                    <bdi>{t(`rule.${rule}.watches`)}</bdi>
                  </span>
                </p>
                {rule === 'expiry' && (
                  <p className="text-[11px] leading-[15px] text-pretty text-muted-foreground">
                    <span>
                      <bdi>{t('rule.expiry.owner')}</bdi>
                    </span>
                  </p>
                )}
              </div>
              {RULE_STAGES[rule].map((stage) => {
                const day = stage === 'breach' ? undefined : dayOf(rule, stage);
                const broken = problem?.rule === rule && problem.stage === stage;
                const audience = (STAGE_AUDIENCE[rule][stage] ?? [])
                  .map((a) => t(`audience.${rule === 'expiry' && a === 'owner' ? 'officer' : a}`))
                  .join(t('listSeparator'));
                return (
                  <div
                    key={stage}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t px-3.5 py-2.5"
                  >
                    <span
                      className={cn('size-1.5 shrink-0 rounded-full', STAGE_DOT[stage])}
                      aria-hidden
                    />
                    <span className="w-[88px] shrink-0 text-xs leading-4 font-medium">
                      {tc(`stageName.${stage}`)}
                    </span>
                    <span className="flex h-7 w-[150px] shrink-0 items-center text-xs leading-4 text-muted-foreground">
                      {stage === 'breach' ? (
                        <span>
                          <bdi>{t(`breach.${rule}`)}</bdi>
                        </span>
                      ) : canEdit ? (
                        <Select
                          value={String(day)}
                          onValueChange={(v) => v && setDay(rule, stage, Number(v))}
                        >
                          <SelectTrigger
                            size="sm"
                            className="w-full"
                            aria-label={t('daysFor', {
                              stage: tc(`stageName.${stage}`),
                              rule: t(`rule.${rule}.label`),
                            })}
                            aria-invalid={broken}
                          >
                            <SelectValue>{(v) => t('days', { count: Number(v) })}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {THRESHOLD_DAYS.map((d) => (
                              <SelectItem key={d} value={String(d)}>
                                {t('days', { count: d })}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span>
                          <bdi>{t('daysBefore', { count: day ?? 0 })}</bdi>
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 grow basis-40 text-[11px] leading-[15px] text-pretty text-muted-foreground">
                      <span>
                        <bdi>{t('tells', { who: audience })}</bdi>
                      </span>
                    </span>
                  </div>
                );
              })}
            </section>
          ))}
        </div>

        {canEdit && problem && (
          <p role="alert" className="text-sm text-destructive">
            {t('error.order', {
              rule: t(`rule.${problem.rule}.label`),
              stage: tc(`stageName.${problem.stage}`),
            })}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter className="sm:justify-between">
          {canEdit ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={standard}
                onClick={() => (setError(''), setDraft(DEFAULT_ESCALATION_THRESHOLDS))}
              >
                {t('reset')}
              </Button>
              <span className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                >
                  {t('cancel')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || !changed || problem !== null}
                  onClick={() => void save()}
                >
                  {busy ? t('saving') : t('save')}
                </Button>
              </span>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              className="sm:ms-auto"
              onClick={() => onOpenChange(false)}
            >
              {t('done')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
