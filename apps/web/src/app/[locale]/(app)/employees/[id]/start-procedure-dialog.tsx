'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { GroProcessType } from '@hr/contracts';

import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
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
export function StartProcedureDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
}) {
  const t = useTranslations('person.proc');
  const tg = useTranslations('gro');
  const router = useRouter();
  const [type, setType] = useState<GroProcessType>('iqama_renewal');
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
        body: JSON.stringify({ employeeId, type, ...(due ? { dueDate: due } : {}) }),
      });
      onOpenChange(false);
      setDue('');
      toastSuccess(t('started', { type: tg(`type.${type}`), name: employeeName }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description', { name: employeeName })}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3.5">
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
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t('saving') : t('submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
