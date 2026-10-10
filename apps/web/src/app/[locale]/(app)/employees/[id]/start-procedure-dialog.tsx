'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { GroProcessType } from '@hr/contracts';

import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { BandWarning, type BandSource } from '@/components/band-warning';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toastSuccess } from '@/components/ui/toast';

// The procedure types, listed here rather than read from the contract's zod
// schema: importing the schema VALUE pulls zod into this page's client bundle
// (measured: the record page went 9.6 kB → 41.9 kB). `satisfies` keeps the list
// honest against the contract's type; a type added there that is missing here
// is the only thing this cannot catch, and the GRO screen lists types the same way.
const TYPES = [
  'iqama_issue',
  'iqama_renewal',
  'exit_reentry',
  'final_exit',
  'profession_change',
  'sponsorship_transfer',
  'work_permit_renewal',
  'other',
] as const satisfies readonly GroProcessType[];

// "Start a procedure" on the Person record (DS-06). The prototype only drafts a
// procedure in memory; here it opens a REAL one through the GRO API (GRO-02),
// for this employee, at `not_started` — assigning and advancing it stays on the
// GRO screen, which already owns that workflow.
//
// DS-10: the Client record opens it too, for ONE of the company's people — pass
// `choices` (and the company as `context`) instead of a fixed employee, and the
// form asks who it is for first.
export function StartProcedureDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  choices,
  context,
  description,
  onStarted,
  bandFor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId?: string;
  employeeName?: string;
  choices?: ReadonlyArray<{ id: string; name: string }>;
  context?: string;
  /** Replaces the description — the Overview's picker spans every client (DS-17). */
  description?: string;
  /** Called after the procedure is opened (the Client record recounts its open items). */
  onStarted?: () => void;
  /**
   * The employer's Nitaqat band for an employee (PROF-06): the dialog warns —
   * and never blocks — when a RED band bears on the chosen procedure type.
   */
  bandFor?: (employeeId: string) => BandSource | null | undefined;
}) {
  const t = useTranslations('person.proc');
  const tg = useTranslations('gro');
  const router = useRouter();
  const [type, setType] = useState<GroProcessType>('iqama_renewal');
  const [picked, setPicked] = useState('');
  const forId = employeeId ?? picked;
  const forName = employeeName ?? choices?.find((c) => c.id === picked)?.name ?? '';
  const [due, setDue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch('/gro-processes', {
        method: 'POST',
        body: JSON.stringify({ employeeId: forId, type, ...(due ? { dueDate: due } : {}) }),
      });
      onOpenChange(false);
      setDue('');
      setPicked('');
      toastSuccess(t('started', { type: tg(`type.${type}`), name: forName }));
      onStarted?.();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {description
              ? description
              : choices
                ? t('descriptionFor', { context: context ?? '' })
                : t('description', { name: employeeName ?? '' })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3.5">
          {choices && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sp-employee">{t('employee')}</Label>
              <Select value={picked} onValueChange={(v) => setPicked(v ?? '')}>
                <SelectTrigger id="sp-employee" className="w-full">
                  <SelectValue placeholder={t('pickEmployee')}>
                    {(v) => (v ? (choices.find((c) => c.id === v)?.name ?? '') : t('pickEmployee'))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {choices.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sp-type">{t('type')}</Label>
            <Select value={type} onValueChange={(v) => setType((v as GroProcessType) ?? 'other')}>
              <SelectTrigger id="sp-type" className="w-full">
                <SelectValue>{(v) => tg(`type.${String(v)}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((ty) => (
                  <SelectItem key={ty} value={ty}>
                    {tg(`type.${ty}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sp-due">{t('dueDate')}</Label>
            <Input id="sp-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          {/* Asked even before a person is picked: on a Client record the
              employer is already known (an empty id is simply not found). */}
          <BandWarning source={bandFor?.(forId)} check={{ kind: 'procedure', type }} />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={saving || !forId}>
              {saving ? t('saving') : t('submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
