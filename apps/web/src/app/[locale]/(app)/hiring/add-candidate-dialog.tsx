'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { NATIONALITIES, useNationalityName } from '@/lib/nationality';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// "Add a candidate" against a role (DS-09) — they enter the board at Applied.
// Both names are required (the contract keeps them bilingual); nationality is a
// picker rather than REC-06's two-letter box, and it is always set, because
// onboarding (`hired`) refuses a candidate without one (REC-05). The prototype's
// "Where they came from" is the candidate's notes.

export interface RoleSummary {
  id: string;
  title: string;
  client: string;
  department: string | null;
}

interface Form {
  nameEn: string;
  nameAr: string;
  nationality: string;
  notes: string;
}
const EMPTY: Form = { nameEn: '', nameAr: '', nationality: 'IN', notes: '' };

export function AddCandidateDialog({
  role,
  onOpenChange,
  onAdded,
}: {
  role: RoleSummary | null;
  onOpenChange: (open: boolean) => void;
  onAdded: (name: string) => void;
}) {
  const t = useTranslations('hiring');
  const locale = useLocale();
  const router = useRouter();
  const nationalityName = useNationalityName(locale);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lastRole, setLastRole] = useState<string | null>(null);

  // A fresh form each time the dialog opens for a role — tracked during render,
  // because Base UI's onOpenChange never fires when the parent opens it.
  if (role && role.id !== lastRole) {
    setLastRole(role.id);
    setForm(EMPTY);
    setError('');
  }
  if (!role && lastRole !== null) setLastRole(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!role) return;
    if (!form.nameEn.trim() || !form.nameAr.trim()) return setError(t('candidateNameRequired'));
    setSaving(true);
    setError('');
    try {
      await apiFetch('/candidates', {
        method: 'POST',
        body: JSON.stringify({
          vacancyId: role.id,
          name: { en: form.nameEn.trim(), ar: form.nameAr.trim() },
          nationality: form.nationality,
          ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
        }),
      });
      onOpenChange(false);
      onAdded(locale === 'ar' ? form.nameAr.trim() : form.nameEn.trim());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('saveError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={role !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('addCandidateTitle')}</DialogTitle>
          <DialogDescription>{t('addCandidateDescription')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-0.5 rounded-md bg-neutral-50 px-3.5 py-3 ring-1 ring-foreground/10">
            <span className="text-sm leading-[19px] font-medium">{role?.title}</span>
            <span className="text-xs leading-4 text-muted-foreground">
              {[role?.client, role?.department].filter(Boolean).join(' · ')}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ac-name-en">{t('fieldFullName')}</Label>
              <Input
                id="ac-name-en"
                value={form.nameEn}
                placeholder="Rakesh Menon"
                onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ac-name-ar">{t('fieldNameAr')}</Label>
              <Input
                id="ac-name-ar"
                dir="rtl"
                value={form.nameAr}
                placeholder="راكيش مينون"
                onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ac-nat">{t('fieldNationality')}</Label>
            <Select
              value={form.nationality}
              onValueChange={(v) => setForm({ ...form, nationality: v ?? 'IN' })}
            >
              <SelectTrigger id="ac-nat" className="w-full" aria-describedby="ac-nat-hint">
                <SelectValue>{(v) => nationalityName(String(v))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {NATIONALITIES.map((n) => (
                  <SelectItem key={n} value={n}>
                    {nationalityName(n)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id="ac-nat-hint" className="text-xs text-muted-foreground">
              {t('nationalityHint')}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ac-notes">{t('fieldSource')}</Label>
            <Textarea
              id="ac-notes"
              rows={3}
              value={form.notes}
              placeholder={t('sourcePlaceholder')}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t('saving') : t('addCandidate')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
