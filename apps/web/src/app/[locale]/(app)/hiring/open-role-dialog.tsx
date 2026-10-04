'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { ClientResponse } from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// "Open a role" (DS-09). The prototype adds the role straight onto the board as
// open; a vacancy here is created as `draft` (REC-02), so this creates it and then
// opens it — two calls, needing vacancy.create + vacancy.approve (the button is
// only shown to holders of both). The contract requires the title in BOTH
// languages, so the form asks for both where the prototype has one field.

interface Form {
  titleEn: string;
  titleAr: string;
  clientId: string;
  department: string;
  headcount: string;
}

export interface OpenedRole {
  title: string;
  client: string;
  headcount: number;
}

export function OpenRoleDialog({
  open,
  onOpenChange,
  clients,
  onOpened,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: ClientResponse[];
  onOpened: (role: OpenedRole) => void;
}) {
  const t = useTranslations('hiring');
  const locale = useLocale();
  const router = useRouter();
  const active = clients.filter((c) => c.status === 'active');
  const nameOf = (id: string) => {
    const c = clients.find((x) => x.id === id);
    return c ? (locale === 'ar' ? c.name.ar : c.name.en) : '';
  };
  const [form, setForm] = useState<Form>({
    titleEn: '',
    titleAr: '',
    clientId: '',
    department: '',
    headcount: '1',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reset when the dialog OPENS, tracked during render: Base UI's onOpenChange
  // never fires when the parent sets `open`, and resetting on close would flash
  // an empty form mid-fade.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm({
        titleEn: '',
        titleAr: '',
        clientId: active[0]?.id ?? '',
        department: '',
        headcount: '1',
      });
      setError('');
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.titleEn.trim() || !form.titleAr.trim()) return setError(t('roleTitleRequired'));
    const headcount = Math.max(1, Math.min(999, Number(form.headcount) || 1));
    setSaving(true);
    setError('');
    try {
      const created = await apiFetch<{ id: string }>('/vacancies', {
        method: 'POST',
        body: JSON.stringify({
          clientId: form.clientId,
          title: { en: form.titleEn.trim(), ar: form.titleAr.trim() },
          ...(form.department.trim() ? { department: form.department.trim() } : {}),
          headcount,
        }),
      });
      await apiFetch(`/vacancies/${created.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: 'open' }),
      });
      onOpenChange(false);
      onOpened({
        title: locale === 'ar' ? form.titleAr.trim() : form.titleEn.trim(),
        client: nameOf(form.clientId),
        headcount,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('saveError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('openRoleTitle')}</DialogTitle>
          <DialogDescription>{t('openRoleDescription')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3.5">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="or-title-en">{t('fieldRoleTitle')}</Label>
              <Input
                id="or-title-en"
                value={form.titleEn}
                placeholder="Quantity surveyor"
                onChange={(e) => setForm({ ...form, titleEn: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="or-title-ar">{t('fieldRoleTitleAr')}</Label>
              <Input
                id="or-title-ar"
                dir="rtl"
                value={form.titleAr}
                placeholder="مساح كميات"
                onChange={(e) => setForm({ ...form, titleAr: e.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="or-client">{t('fieldClient')}</Label>
            <Select
              value={form.clientId}
              onValueChange={(v) => setForm({ ...form, clientId: v ?? '' })}
            >
              <SelectTrigger id="or-client" className="w-full">
                <SelectValue placeholder={t('selectClient')}>
                  {(v) => (v ? nameOf(String(v)) : t('selectClient'))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {active.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {locale === 'ar' ? c.name.ar : c.name.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="or-dept">{t('fieldDepartment')}</Label>
              <Input
                id="or-dept"
                value={form.department}
                placeholder={t('departmentPlaceholder')}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="or-count">{t('fieldPositions')}</Label>
              <Input
                id="or-count"
                type="number"
                min={1}
                max={999}
                value={form.headcount}
                onChange={(e) => setForm({ ...form, headcount: e.target.value })}
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="border-t pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={saving || !form.clientId}>
              {saving ? t('saving') : t('openRoleSubmit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
