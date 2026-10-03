'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Stamp } from 'lucide-react';
import type {
  EmployeeResponse,
  GroProcessListResponse,
  GroProcessResponse,
  GroProcessStatus,
} from '@hr/contracts';
import { formatHijri } from '@hr/dates';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
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

// The Person record's Open work tab (DS-07) — the prototype's list of what is
// still open on this person, soonest first, each with a due date (and its Hijri
// day) and a way to move it on.
//
// Government procedures are listed for real (GET /gro-processes?employeeId=).
// Requests and internal tasks do not record which employee they concern, so they
// cannot be listed per person yet — said in a note, not faked (owner decision).
// "Resolve" is the shared status control over the SAME workflow rules the GRO
// screen uses (lib/gro-workflow.ts); completing a process whose type writes an
// expiry back to the employee asks for that date first (GRO-03).

const ACTIVE: ReadonlySet<GroProcessStatus> = new Set([
  'not_started',
  'in_progress',
  'submitted',
  'approved',
  'rejected',
]);

function daysTo(iso: string): number {
  const target = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}

export function OpenWorkTab({
  emp,
  onEmployeeChanged,
}: {
  emp: EmployeeResponse;
  /** Completing an expiry-bearing process changes the employee's record. */
  onEmployeeChanged: () => void;
}) {
  const t = useTranslations('person.work');
  const tg = useTranslations('gro');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const canProcess = useCan('gro.process');

  const [items, setItems] = useState<GroProcessResponse[] | null>(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiFetch<GroProcessListResponse>(`/gro-processes?employeeId=${emp.id}`);
      setItems(
        res.processes
          .filter((p) => ACTIVE.has(p.status))
          .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setItems([]);
      setError(t('error'));
    }
  }
  useEffect(() => {
    void load();
  }, [emp.id]);

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
  // The prototype's due line: overdue in red, today in amber, the next week dark,
  // later muted.
  const due = (iso: string | null) => {
    if (!iso) return { label: t('noDue'), cls: 'text-muted-foreground' };
    const n = daysTo(iso);
    if (n < 0) return { label: t('dueOver', { n: Math.abs(n) }), cls: 'text-status-critical' };
    if (n === 0) return { label: t('dueToday'), cls: 'text-status-warning' };
    if (n <= 7) return { label: day(iso), cls: 'text-neutral-800' };
    return { label: day(iso), cls: 'text-muted-foreground' };
  };

  // ---- status ----
  const [completing, setCompleting] = useState<GroProcessResponse | null>(null);
  const [expiry, setExpiry] = useState('');
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState('');

  async function apply(
    p: GroProcessResponse,
    next: GroProcessStatus,
    resultingExpiry: string | null,
  ) {
    setSaving(true);
    setError('');
    setDialogError('');
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
      setCompleting(null);
      await load();
      if (next === 'completed' && resultingExpiry) onEmployeeChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      if (completing) setDialogError(t('error'));
      else setError(t('error'));
    } finally {
      setSaving(false);
    }
  }

  const choose = (p: GroProcessResponse, next: GroProcessStatus) => {
    if (next === 'completed' && GRO_EXPIRY_TYPES.has(p.type)) {
      setExpiry(p.resultingExpiry ?? '');
      setDialogError('');
      setCompleting(p);
      return;
    }
    void apply(p, next, null);
  };

  async function submitComplete(e: FormEvent) {
    e.preventDefault();
    if (!completing || !expiry) return;
    await apply(completing, 'completed', expiry);
  }

  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      {error && (
        <p role="alert" className="border-b px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {items !== null && items.length === 0 && (
        <div className="px-6 py-12 text-center text-sm leading-5 text-muted-foreground">
          {t('empty')}
        </div>
      )}
      {items?.map((p) => {
        const d = due(p.dueDate);
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
            <span className="flex w-28 shrink-0 flex-col items-end">
              <span className={`text-[13px] leading-[17px] font-medium ${d.cls}`}>{d.label}</span>
              {p.dueDate && (
                <span className="text-[10px] leading-[14px] text-neutral-400">
                  {formatHijri(new Date(p.dueDate), locale)}
                </span>
              )}
            </span>
            {canProcess && (
              <span className="flex shrink-0">
                <StatusAction
                  next={GRO_NEXT[p.status]}
                  onSelect={(next) => choose(p, next)}
                  label={(s) => tg(`status.${s}`)}
                  placeholder={t('resolve')}
                  className="h-6 w-32 text-xs"
                />
              </span>
            )}
          </div>
        );
      })}
      <p className="bg-neutral-50 px-4 py-2.5 text-xs leading-4 text-muted-foreground">
        {t('soonNote')}
      </p>

      <Dialog open={completing !== null} onOpenChange={(o) => !o && setCompleting(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>
              {completing ? t('completeTitle', { type: tg(`type.${completing.type}`) }) : ''}
            </DialogTitle>
            <DialogDescription>{t('completeDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitComplete} className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ow-expiry">{t('resultingExpiry')}</Label>
              <Input
                id="ow-expiry"
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                required
              />
            </div>
            {dialogError && (
              <p role="alert" className="text-sm text-destructive">
                {dialogError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setCompleting(null)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={saving || !expiry}>
                {saving ? t('completing') : t('complete')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
