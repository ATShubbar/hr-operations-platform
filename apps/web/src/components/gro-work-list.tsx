'use client';

import { isFinished } from '@hr/contracts/work-status';
import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Stamp } from 'lucide-react';
import type { GroProcessResponse, GroProcessStatus } from '@hr/contracts';
import { formatHijri } from '@hr/dates';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { daysTo } from '@/lib/employee-docs';
import { GRO_EXPIRY_TYPES, GRO_NEXT } from '@/lib/gro-workflow';
import type { Locale } from '@/lib/employee-format';
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
import { StatusAction } from '@/components/ui/status-action';

// Open government procedures as rows, each with "Resolve" (DS-07, shared in
// DS-11): the Person record lists one person's, the Client record a whole
// company's. Resolve is the shared status control over the SAME workflow rules
// the GRO screen uses (lib/gro-workflow.ts); completing a process whose type
// writes an expiry back to the employee asks for that date first (GRO-03).

/** An open procedure — not finished by the ONE shared definition (CAL-04). */
export const isOpenProcedure = (status: GroProcessStatus) => !isFinished('procedure', status);

/** Soonest due first; undated last. */
export const byDue = <T extends { dueDate: string | null }>(a: T, b: T) =>
  (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');

/**
 * The prototype's due line: overdue in red, today in amber, the next week dark,
 * later muted.
 */
export function useDueLabel() {
  const t = useTranslations('person.work');
  const locale = useLocale();
  const day = (iso: string) => {
    const d = new Date(iso);
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
  return (iso: string | null) => {
    if (!iso) return { label: t('noDue'), cls: 'text-muted-foreground' };
    const n = daysTo(iso);
    if (n < 0) return { label: t('dueOver', { n: Math.abs(n) }), cls: 'text-status-critical' };
    if (n === 0) return { label: t('dueToday'), cls: 'text-status-warning' };
    if (n <= 7) return { label: day(iso), cls: 'text-neutral-800' };
    return { label: day(iso), cls: 'text-muted-foreground' };
  };
}

export function DueCell({ iso }: { iso: string | null }) {
  const locale = useLocale() as Locale;
  const d = useDueLabel()(iso);
  return (
    <span className="flex w-28 shrink-0 flex-col items-end">
      <span className={`text-[13px] leading-[17px] font-medium ${d.cls}`}>{d.label}</span>
      {iso && (
        <span className="text-[10px] leading-[14px] text-neutral-400">
          {formatHijri(new Date(iso), locale)}
        </span>
      )}
    </span>
  );
}

/**
 * Resolve for ONE procedure: the shared status control, plus the completion
 * dialog that captures the resulting expiry when the type writes one back
 * (GRO-03). Renders nothing for someone without gro.process.
 */
export function GroResolve({
  process: p,
  onChanged,
  onEmployeeChanged,
  className = 'h-6 w-32 text-xs',
}: {
  process: GroProcessResponse;
  /** After the status change — the parent reloads. */
  onChanged: () => Promise<void> | void;
  /** Completing an expiry-bearing process changed that employee's record. */
  onEmployeeChanged?: (employeeId: string) => void;
  className?: string;
}) {
  const t = useTranslations('person.work');
  const tg = useTranslations('gro');
  const router = useRouter();
  const canProcess = useCan('gro.process');
  const [completing, setCompleting] = useState(false);
  const [expiry, setExpiry] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function apply(next: GroProcessStatus, resultingExpiry: string | null) {
    setSaving(true);
    setError('');
    try {
      if (resultingExpiry) {
        await apiFetch(`/gro-processes/${p.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ resultingExpiry }),
        });
      }
      await apiFetch(`/gro-processes/${p.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: next }),
      });
      setCompleting(false);
      await onChanged();
      if (next === 'completed' && resultingExpiry) onEmployeeChanged?.(p.employeeId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('error'));
    } finally {
      setSaving(false);
    }
  }

  const choose = (next: GroProcessStatus) => {
    if (next === 'completed' && GRO_EXPIRY_TYPES.has(p.type)) {
      setExpiry(p.resultingExpiry ?? '');
      setError('');
      setCompleting(true);
      return;
    }
    void apply(next, null);
  };

  async function submitComplete(e: FormEvent) {
    e.preventDefault();
    if (expiry) await apply('completed', expiry);
  }

  if (!canProcess) return null;
  return (
    <>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <StatusAction
          next={GRO_NEXT[p.status]}
          onSelect={choose}
          label={(s) => tg(`status.${s}`)}
          placeholder={t('resolve')}
          className={className}
        />
        {error && !completing && (
          <span role="alert" className="text-[11px] leading-4 text-destructive">
            {error}
          </span>
        )}
      </span>

      <Dialog open={completing} onOpenChange={(o) => !o && setCompleting(false)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{t('completeTitle', { type: tg(`type.${p.type}`) })}</DialogTitle>
            <DialogDescription>{t('completeDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitComplete} className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`expiry-${p.id}`}>{t('resultingExpiry')}</Label>
              <Input
                id={`expiry-${p.id}`}
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                required
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setCompleting(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={saving || !expiry}>
                {saving ? t('completing') : t('complete')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function GroWorkRows({
  items,
  personOf,
  onChanged,
  onEmployeeChanged,
}: {
  items: readonly GroProcessResponse[];
  /** The person's name, shown first on the meta line (company-wide lists). */
  personOf?: (p: GroProcessResponse) => string | null;
  /** After any status change — the parent reloads its list. */
  onChanged: () => Promise<void> | void;
  /** Completing an expiry-bearing process changed that employee's record. */
  onEmployeeChanged?: (employeeId: string) => void;
}) {
  const t = useTranslations('person.work');
  const tg = useTranslations('gro');
  return (
    <>
      {items.map((p) => {
        const person = personOf?.(p);
        return (
          <div
            key={p.id}
            className="flex flex-wrap items-center gap-3 px-4 py-3 shadow-[inset_0_-1px_0_var(--border)] sm:flex-nowrap"
          >
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
              <Stamp className="size-4" aria-hidden />
            </span>
            <span className="flex min-w-0 grow flex-col gap-px">
              <span className="text-sm leading-5 font-medium">{tg(`type.${p.type}`)}</span>
              <span className="text-xs leading-4 text-muted-foreground">
                {person && <>{person} · </>}
                {p.referenceNumber ? (
                  <bdi dir="ltr" className="font-mono">
                    {p.referenceNumber}
                  </bdi>
                ) : (
                  t('noRef')
                )}{' '}
                · {tg(`status.${p.status}`)}
              </span>
            </span>
            <DueCell iso={p.dueDate} />
            <GroResolve process={p} onChanged={onChanged} onEmployeeChanged={onEmployeeChanged} />
          </div>
        );
      })}
    </>
  );
}
