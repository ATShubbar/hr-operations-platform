'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { ClientResponse, NitaqatBand } from '@hr/contracts';
import { CLIENT_CITIES, CLIENT_SECTORS, NITAQAT_BANDS } from '@hr/contracts/client-profile';
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

// Add a client / Edit a client (CLIENT-04's form; the prototype's since PROF-02,
// ADR-019): the two names, the commercial registration, city, sector and the
// Nitaqat band — plus, when ADDING, the main contact and their email, as the
// prototype's form has them. Afterwards the contact lives on the record's
// Records tab with the signatories and registrations.
//
// Only the names are required: a client may be added before its paperwork is to
// hand. The band is what Qiwa shows — the app never calculates it — so it
// travels with the day it was checked. An edit sends ONLY what changed. Status
// is not here: the record's header archives and restores.

const NONE = 'none';
const today = () => new Date().toISOString().slice(0, 10);

interface Form {
  nameEn: string;
  nameAr: string;
  crNumber: string;
  city: string;
  sector: string;
  band: string;
  checkedOn: string;
  contactName: string;
  contactEmail: string;
}

const formOf = (c?: ClientResponse | null): Form => ({
  nameEn: c?.name.en ?? '',
  nameAr: c?.name.ar ?? '',
  crNumber: c?.crNumber ?? '',
  city: c?.city ?? NONE,
  sector: c?.sector ?? NONE,
  band: c?.nitaqat?.band ?? NONE,
  checkedOn: c?.nitaqat?.checkedOn ?? today(),
  contactName: '',
  contactEmail: '',
});

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
  const tp = useTranslations('clientProfile');
  const router = useRouter();
  const [form, setForm] = useState<Form>(formOf(null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reset when the dialog OPENS, tracked during render — Base UI's onOpenChange
  // never fires when the parent sets `open` (DS-09).
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(formOf(client));
      setError('');
    }
  }

  // An edit answers the last refusal: the message goes as soon as they type.
  const set = (key: keyof Form) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError('');
  };

  // What to send: everything given on create; on edit only what differs.
  function body(): Record<string, unknown> | string {
    const cr = form.crNumber.trim();
    if (cr && !/^\d{10}$/.test(cr)) return t('form.error.cr');
    const hasBand = form.band !== NONE;
    if (hasBand && (!form.checkedOn || form.checkedOn > today())) return t('form.error.checkedOn');
    const email = form.contactEmail.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return t('form.error.email');

    const next = {
      name: { en: form.nameEn.trim(), ar: form.nameAr.trim() },
      crNumber: cr || null,
      city: form.city === NONE ? null : form.city,
      sector: form.sector === NONE ? null : form.sector,
      nitaqat: hasBand ? { band: form.band as NitaqatBand, checkedOn: form.checkedOn } : null,
    };
    if (!client) {
      const contact = {
        ...(form.contactName.trim() ? { nameEn: form.contactName.trim() } : {}),
        ...(email ? { email } : {}),
      };
      return {
        name: next.name,
        ...(next.crNumber ? { crNumber: next.crNumber } : {}),
        ...(next.city ? { city: next.city } : {}),
        ...(next.sector ? { sector: next.sector } : {}),
        ...(next.nitaqat ? { nitaqat: next.nitaqat } : {}),
        ...(Object.keys(contact).length ? { contact } : {}),
      };
    }
    const changed: Record<string, unknown> = {};
    if (next.name.en !== client.name.en || next.name.ar !== client.name.ar)
      changed.name = next.name;
    if (next.crNumber !== client.crNumber) changed.crNumber = next.crNumber;
    if (next.city !== client.city) changed.city = next.city;
    if (next.sector !== client.sector) changed.sector = next.sector;
    if (
      (next.nitaqat?.band ?? null) !== (client.nitaqat?.band ?? null) ||
      (next.nitaqat?.checkedOn ?? null) !== (client.nitaqat?.checkedOn ?? null)
    ) {
      changed.nitaqat = next.nitaqat;
    }
    return changed;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const payload = body();
    if (typeof payload === 'string') return setError(payload);
    // Nothing changed: there is nothing to save, and nothing to audit.
    if (client && Object.keys(payload).length === 0) return onOpenChange(false);
    setSaving(true);
    setError('');
    try {
      const saved = client
        ? await apiFetch<ClientResponse>(`/clients/${client.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await apiFetch<ClientResponse>('/clients', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
      onOpenChange(false);
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      // Server refusals are mapped to our own words — never shown raw.
      setError(
        err instanceof ApiError && err.status === 409
          ? t('form.error.crTaken')
          : err instanceof ApiError && err.status === 400
            ? t('form.error.invalid')
            : t('saveError'),
      );
    } finally {
      setSaving(false);
    }
  }

  const pick = (
    id: string,
    label: string,
    key: 'city' | 'sector' | 'band',
    options: readonly string[],
    labelOf: (v: string) => string,
  ) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={form[key]} onValueChange={(v) => v && set(key)(String(v))}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue>
            {(v) => (v === NONE || !v ? t('form.choose') : labelOf(String(v)))}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t('form.choose')}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {labelOf(o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>{client ? t('editTitle') : t('createTitle')}</DialogTitle>
          <DialogDescription>
            {client ? t('editDescription') : t('createDescription')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cf-name-en">{t('nameEn')}</Label>
              <Input
                id="cf-name-en"
                value={form.nameEn}
                placeholder="Arabian Shield Contracting"
                onChange={(e) => set('nameEn')(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cf-name-ar">{t('nameAr')}</Label>
              <Input
                id="cf-name-ar"
                dir="rtl"
                value={form.nameAr}
                placeholder="الدرع العربي للمقاولات"
                onChange={(e) => set('nameAr')(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-cr">{t('form.crNumber')}</Label>
            <Input
              id="cf-cr"
              dir="ltr"
              inputMode="numeric"
              maxLength={10}
              value={form.crNumber}
              placeholder="1010224417"
              aria-describedby="cf-cr-help"
              onChange={(e) => set('crNumber')(e.target.value.replace(/\D/g, ''))}
              className="font-mono"
            />
            <p id="cf-cr-help" className="text-xs leading-4 text-muted-foreground">
              {t('form.crHelper')}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {pick('cf-city', t('form.city'), 'city', CLIENT_CITIES, (v) => tp(`city.${v}`))}
            {pick('cf-sector', t('form.sector'), 'sector', CLIENT_SECTORS, (v) =>
              tp(`sector.${v}`),
            )}
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              {pick('cf-band', t('form.band'), 'band', NITAQAT_BANDS, (v) => tp(`band.${v}`))}
              <p className="text-xs leading-4 text-muted-foreground">{t('form.bandHelper')}</p>
            </div>
            {form.band !== NONE && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cf-checked">{t('form.checkedOn')}</Label>
                <Input
                  id="cf-checked"
                  type="date"
                  max={today()}
                  value={form.checkedOn}
                  onChange={(e) => set('checkedOn')(e.target.value)}
                />
              </div>
            )}
          </div>

          {!client && (
            <>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cf-contact">{t('form.contactName')}</Label>
                  <Input
                    id="cf-contact"
                    value={form.contactName}
                    placeholder="Hassan Al-Balawi"
                    onChange={(e) => set('contactName')(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cf-email">{t('form.contactEmail')}</Label>
                  <Input
                    id="cf-email"
                    type="email"
                    dir="ltr"
                    value={form.contactEmail}
                    placeholder="h.balawi@company.com.sa"
                    onChange={(e) => set('contactEmail')(e.target.value)}
                  />
                </div>
              </div>
              <p className="rounded-md bg-neutral-50 px-3 py-2.5 text-xs leading-4 text-muted-foreground ring-1 ring-foreground/10">
                {t('form.registerSoon')}
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={saving || !form.nameEn.trim() || !form.nameAr.trim()}>
              {saving ? t('saving') : client ? t('save') : t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
