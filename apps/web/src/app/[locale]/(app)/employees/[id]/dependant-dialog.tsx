'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { DependantRelationship, DependantResponse } from '@hr/contracts';
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

// Add or edit a dependant (DEP-03, ADR-017) — the prototype's "Add a dependant"
// dialog (relationship, full name, Arabic name, iqama number), plus the date of
// birth and the three expiry dates it otherwise invented. Edit sends ONLY the
// fields that changed. Server refusals are mapped to translations; raw API text
// never reaches the screen.

const RELATIONSHIPS: DependantRelationship[] = ['spouse', 'son', 'daughter'];

interface Form {
  relationship: DependantRelationship;
  nameEn: string;
  nameAr: string;
  dateOfBirth: string;
  iqamaNumber: string;
  iqamaExpiry: string;
  passportExpiry: string;
  insuranceExpiry: string;
}
type Field = keyof Form;

const EMPTY: Form = {
  relationship: 'spouse',
  nameEn: '',
  nameAr: '',
  dateOfBirth: '',
  iqamaNumber: '',
  iqamaExpiry: '',
  passportExpiry: '',
  insuranceExpiry: '',
};

const fromDependant = (d: DependantResponse): Form => ({
  relationship: d.relationship,
  nameEn: d.nameEn,
  nameAr: d.nameAr ?? '',
  dateOfBirth: d.dateOfBirth ?? '',
  // A masked number is not editable here: the field starts empty and an empty
  // field is not sent, so saving other details never clears what is hidden.
  iqamaNumber: d.identifierVisible ? (d.iqamaNumber ?? '') : '',
  iqamaExpiry: d.iqamaExpiry ?? '',
  passportExpiry: d.passportExpiry ?? '',
  insuranceExpiry: d.insuranceExpiry ?? '',
});

const IQAMA_RE = /^2\d{9}$/;

export function DependantDialog({
  open,
  onOpenChange,
  employeeId,
  sponsorName,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  sponsorName: string;
  /** The dependant being edited; null adds a new one. */
  editing: DependantResponse | null;
  onSaved: (d: DependantResponse, created: boolean) => void;
}) {
  const t = useTranslations('person.family');
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Base UI's onOpenChange never fires when the PARENT opens the dialog, so the
  // form is reset by watching `open` during render (DS-09 landmine).
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(editing ? fromDependant(editing) : EMPTY);
      setError('');
    }
  }

  const set = (k: Field) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const masked = editing !== null && !editing.identifierVisible;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.nameEn.trim()) return setError(t('dialog.error.name'));
    const iqama = form.iqamaNumber.replace(/\s/g, '');
    if (iqama && !IQAMA_RE.test(iqama)) return setError(t('dialog.error.iqama'));

    const value = (k: Field): string | null => {
      const v = k === 'iqamaNumber' ? iqama : form[k].trim();
      return v === '' ? null : v;
    };
    let body: Record<string, string | null>;
    if (editing) {
      const before = fromDependant(editing);
      body = {};
      for (const k of Object.keys(form) as Field[]) {
        if (k === 'iqamaNumber' && masked && iqama === '') continue;
        if (value(k) !== (before[k] === '' ? null : before[k])) body[k] = value(k);
      }
      if (Object.keys(body).length === 0) return onOpenChange(false);
    } else {
      body = Object.fromEntries(
        (Object.keys(form) as Field[])
          .map((k) => [k, value(k)] as const)
          .filter(([, v]) => v !== null),
      );
    }

    setSaving(true);
    setError('');
    try {
      const saved = await apiFetch<DependantResponse>(
        editing
          ? `/employees/${employeeId}/dependants/${editing.id}`
          : `/employees/${employeeId}/dependants`,
        { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(body) },
      );
      onSaved(saved, !editing);
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 400
          ? t('dialog.error.invalid')
          : err instanceof ApiError && err.status === 409
            ? t('dialog.error.removed')
            : t('dialog.error.generic'),
      );
    } finally {
      setSaving(false);
    }
  }

  const date = (k: Field, label: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`dep-${k}`}>{label}</Label>
      <Input id={`dep-${k}`} type="date" value={form[k]} onChange={(e) => set(k)(e.target.value)} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>{editing ? t('dialog.editTitle') : t('dialog.addTitle')}</DialogTitle>
          <DialogDescription>{t('dialog.description', { name: sponsorName })}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3.5">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dep-relationship">{t('dialog.relationship')}</Label>
              <Select value={form.relationship} onValueChange={(v) => v && set('relationship')(v)}>
                <SelectTrigger id="dep-relationship" className="w-full">
                  <SelectValue>{(v) => t(`relationship.${String(v)}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {RELATIONSHIPS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t(`relationship.${r}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {date('dateOfBirth', t('dialog.dateOfBirth'))}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dep-nameEn">{t('dialog.nameEn')}</Label>
              <Input
                id="dep-nameEn"
                value={form.nameEn}
                onChange={(e) => set('nameEn')(e.target.value)}
                placeholder="Anitha Nair"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dep-nameAr">{t('dialog.nameAr')}</Label>
              <Input
                id="dep-nameAr"
                dir="rtl"
                value={form.nameAr}
                onChange={(e) => set('nameAr')(e.target.value)}
                placeholder="أنيثا نايـر"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dep-iqamaNumber">{t('dialog.iqamaNumber')}</Label>
            <Input
              id="dep-iqamaNumber"
              dir="ltr"
              inputMode="numeric"
              value={form.iqamaNumber}
              onChange={(e) => set('iqamaNumber')(e.target.value)}
              placeholder={masked ? t('dialog.iqamaHidden') : t('dialog.iqamaHint')}
              className="font-mono"
            />
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            {date('iqamaExpiry', t('dialog.iqamaExpiry'))}
            {date('passportExpiry', t('dialog.passportExpiry'))}
            {date('insuranceExpiry', t('dialog.insuranceExpiry'))}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <span className="grow text-[11px] leading-[15px] text-muted-foreground">
              {t('feeSoon')}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? t('dialog.saving') : editing ? t('dialog.save') : t('dialog.add')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
