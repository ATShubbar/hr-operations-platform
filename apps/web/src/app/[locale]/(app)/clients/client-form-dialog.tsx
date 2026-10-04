'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
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

// Add a client / Edit a client (CLIENT-04's form, moved out of the list in DS-10:
// the list creates, the record edits). Names only — the prototype's commercial
// registration, city, sector and staff-register import belong to the client
// profile feature, so the dialog says so rather than offering fields that save
// nowhere. Status is not here: the record's header archives and restores.

export function ClientFormDialog({
  open,
  onOpenChange,
  client,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The client to edit; omitted = create. */
  client?: ClientResponse | null;
  onSaved: (saved: ClientResponse) => void;
}) {
  const t = useTranslations('clients');
  const router = useRouter();
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reset when the dialog OPENS, tracked during render — Base UI's onOpenChange
  // never fires when the parent sets `open` (DS-09).
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setNameEn(client?.name.en ?? '');
      setNameAr(client?.name.ar ?? '');
      setError('');
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const body = JSON.stringify({ name: { en: nameEn.trim(), ar: nameAr.trim() } });
    try {
      const saved = client
        ? await apiFetch<ClientResponse>(`/clients/${client.id}`, { method: 'PATCH', body })
        : await apiFetch<ClientResponse>('/clients', { method: 'POST', body });
      onOpenChange(false);
      onSaved(saved);
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
          <DialogTitle>{client ? t('editTitle') : t('createTitle')}</DialogTitle>
          <DialogDescription>
            {client ? t('editDescription') : t('createDescription')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3.5">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cf-name-en">{t('nameEn')}</Label>
              <Input
                id="cf-name-en"
                value={nameEn}
                placeholder="Arabian Shield Contracting"
                onChange={(e) => setNameEn(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cf-name-ar">{t('nameAr')}</Label>
              <Input
                id="cf-name-ar"
                dir="rtl"
                value={nameAr}
                placeholder="الدرع العربي للمقاولات"
                onChange={(e) => setNameAr(e.target.value)}
                required
              />
            </div>
          </div>
          {!client && (
            <p className="rounded-md bg-neutral-50 px-3 py-2.5 text-xs leading-4 text-muted-foreground ring-1 ring-foreground/10">
              {t('profileSoon')}
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={saving || !nameEn.trim() || !nameAr.trim()}>
              {saving ? t('saving') : client ? t('save') : t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
