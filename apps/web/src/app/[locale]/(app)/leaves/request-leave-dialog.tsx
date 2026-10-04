'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { LeaveBalanceListResponse, LeaveResponse, LeaveType } from '@hr/contracts';
import { formatHijri } from '@hr/dates';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import type { Locale } from '@/lib/employee-format';
import { LEAVE_CAP, LEAVE_TYPES, addDays, deductsBalance, leaveDate, riyadhToday } from '@/lib/leave';
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
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type Person = LeaveBalanceListResponse['balances'][number];

// The prototype's "Request leave" dialog (LEAVE-04). Who it can be for is the
// caller's balances list — everyone still employed (staff) or the caller's own
// company (client manager) — which client managers can read even with the portal
// switched off. The note under the dates is ADVISORY (cap, balance); the server
// decides, and its refusals come back as translated messages, never raw text.
export function RequestLeaveDialog({
  open,
  onOpenChange,
  people,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: Person[];
  onSubmitted: (row: LeaveResponse) => void;
}) {
  const t = useTranslations('leaves');
  const td = useTranslations('leaves.dialog');
  const locale = useLocale() as Locale;
  const router = useRouter();

  const blank = () => ({
    type: 'annual' as LeaveType,
    employeeId: '',
    days: '5',
    startDate: addDays(riyadhToday(), 14),
    details: '',
  });
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset on every open (Base UI's onOpenChange never fires when the PARENT opens
  // the dialog — the DS-09 landmine — so track `open` during render instead).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(blank());
      setError('');
    }
  }

  const name = (p: Person) => (locale === 'ar' ? p.employee.nameAr : p.employee.nameEn);
  const chosen = people.find((p) => p.employee.id === form.employeeId);
  const want = Number(form.days) || 0;
  const cap = LEAVE_CAP[form.type];

  const note = (() => {
    if (cap && want > cap) return td('noteCap', { days: want, cap });
    if (!deductsBalance(form.type)) return td('noteRecorded');
    if (!chosen) return '';
    const available = chosen.balance.available;
    return want > available
      ? td('noteShort', { days: want, available })
      : td('noteFits', { available, left: available - want });
  })();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.employeeId) return setError(td('errChoose'));
    if (!Number.isInteger(want) || want < 1 || want > 365) return setError(td('errDays'));
    if (!form.startDate) return setError(td('errDate'));
    setSaving(true);
    setError('');
    try {
      const row = await apiFetch<LeaveResponse>('/leave', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: form.employeeId,
          type: form.type,
          startDate: form.startDate,
          days: want,
          ...(form.details.trim() ? { details: form.details.trim() } : {}),
        }),
      });
      onSubmitted(row);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      // The server's reasons (LEAVE-01), mapped to translations.
      const msg = err instanceof ApiError ? err.message : '';
      setError(
        /capped/.test(msg)
          ? td('errCap')
          : /once/.test(msg)
            ? td('errHajj')
            : /has left/.test(msg)
              ? td('errLeaver')
              : td('errGeneric'),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{td('title')}</DialogTitle>
          <DialogDescription>{td('description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lv-type">{td('type')}</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: (v ?? 'annual') as LeaveType })}>
              <SelectTrigger id="lv-type" className="w-full">
                <SelectValue>{(v) => t(`type.${String(v)}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((ty) => (
                  <SelectItem key={ty} value={ty}>
                    {t(`type.${ty}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs leading-4 text-muted-foreground">{t(`basis.${form.type}`)}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lv-who">{td('who')}</Label>
            <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v ?? '' })}>
              <SelectTrigger id="lv-who" className="w-full">
                <SelectValue placeholder={td('choose')}>
                  {(v) => {
                    const p = people.find((x) => x.employee.id === v);
                    return p ? name(p) : td('choose');
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {people.map((p) => (
                  <SelectItem key={p.employee.id} value={p.employee.id}>
                    {name(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-[120px_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lv-days">{td('days')}</Label>
              <Input
                id="lv-days"
                inputMode="numeric"
                value={form.days}
                onChange={(e) => setForm({ ...form, days: e.target.value.replace(/[^0-9]/g, '') })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lv-start">{td('starting')}</Label>
              <Input
                id="lv-start"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
              {/* The owner chose a date picker over the prototype's 16-week list;
                  the Hijri date is echoed so it reads like the prototype's options. */}
              {form.startDate && (
                <p className="text-xs leading-4 text-muted-foreground">
                  {formatHijri(leaveDate(form.startDate), locale)}
                </p>
              )}
            </div>
          </div>

          {note && <p className="text-xs leading-4 text-pretty text-muted-foreground">{note}</p>}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lv-details">{td('details')}</Label>
            <Textarea
              id="lv-details"
              rows={3}
              value={form.details}
              placeholder={td('detailsPlaceholder')}
              onChange={(e) => setForm({ ...form, details: e.target.value })}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {td('cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? td('submitting') : td('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
