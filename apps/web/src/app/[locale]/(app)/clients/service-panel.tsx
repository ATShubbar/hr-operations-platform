'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { ClientResponse, StaffDirectoryResponse } from '@hr/contracts';
import { RESPONSE_COMMITMENTS, SERVICE_TIERS } from '@hr/contracts/client-profile';
import { formatHijri } from '@hr/dates';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { Avatar } from '@/components/ui/avatar';
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
import { toastSuccess } from '@/components/ui/toast';

// The Service panel (PROF-05, ADR-019) — the prototype's: the named officer,
// the tier, the response commitment and when the term ends. Shown on the Client
// record's Overview for staff and on a client manager's own company page.
//
// These are RECORDED FACTS with no behaviour attached: the tier switches
// nothing on, and the commitment is a label — request due dates keep coming
// from the per-type service levels. The panel says so, so nobody reads the
// commitment as a promise the system enforces.
//
// Only an Administrator changes them (`client.update`). The officer picker
// offers the roles government work can be handed to (the ASSIGN-01 rule); the
// server refuses anyone else.

const NONE = 'none';
// The roles a named officer may hold — the server checks `gro.process`, which
// exactly these three hold today (ASSIGN-01).
const OFFICER_ROLES: ReadonlySet<string> = new Set(['administrator', 'hr_officer', 'gro_officer']);

export function ServicePanel({
  client,
  onSaved,
}: {
  client: ClientResponse;
  /** Omitted where nothing can be edited (the client manager's page). */
  onSaved?: (saved: ClientResponse) => void;
}) {
  const t = useTranslations('clients');
  const tp = useTranslations('clientProfile');
  const tr = useTranslations('roles');
  const locale = useLocale() as 'ar' | 'en';
  const router = useRouter();
  const canEdit = useCan('client.update') && Boolean(onSaved);
  const s = client.service;

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [staff, setStaff] = useState<StaffDirectoryResponse['users']>([]);
  const [form, setForm] = useState({
    officer: NONE,
    tier: NONE,
    commitment: NONE,
    start: '',
    end: '',
  });

  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
      numberingSystem: 'latn',
    }).format(new Date(`${iso}T00:00:00Z`));
  const hijri = (iso: string) => formatHijri(new Date(`${iso}T00:00:00Z`), locale);

  async function startEdit() {
    setError('');
    setForm({
      officer: s.officerUserId ?? NONE,
      tier: s.tier ?? NONE,
      commitment: s.responseCommitment ?? NONE,
      start: s.termStart ?? '',
      end: s.termEnd ?? '',
    });
    setOpen(true);
    try {
      const res = await apiFetch<StaffDirectoryResponse>('/staff-users/directory');
      setStaff(res.users.filter((u) => OFFICER_ROLES.has(u.role)));
    } catch {
      setStaff([]); // the picker then offers only "nobody"; saving still works
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.start && form.end && form.end < form.start)
      return setError(t('serviceForm.termOrder'));
    const next = {
      officerUserId: form.officer === NONE ? null : form.officer,
      tier: form.tier === NONE ? null : form.tier,
      responseCommitment: form.commitment === NONE ? null : form.commitment,
      termStart: form.start || null,
      termEnd: form.end || null,
    };
    // Only what changed.
    const changed = Object.fromEntries(
      Object.entries(next).filter(([k, v]) => v !== s[k as keyof typeof next]),
    );
    if (Object.keys(changed).length === 0) return setOpen(false);
    setBusy(true);
    setError('');
    try {
      const saved = await apiFetch<ClientResponse>(`/clients/${client.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ service: changed }),
      });
      setOpen(false);
      onSaved?.(saved);
      toastSuccess(t('profile.saved'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(
        err instanceof ApiError && err.status === 400 ? t('form.error.invalid') : t('saveError'),
      );
    } finally {
      setBusy(false);
    }
  }

  const fact = (label: string, value: string | null, sub?: string) => (
    <div className="flex min-w-0 flex-col gap-px">
      <span className="text-xs leading-4 text-muted-foreground">{label}</span>
      {value ? (
        <>
          <span className="text-[13px] leading-[18px]">{value}</span>
          {sub && <span className="text-[10px] leading-[14px] text-neutral-400">{sub}</span>}
        </>
      ) : (
        <span className="text-[13px] leading-[18px] text-neutral-400">{tp('notRecorded')}</span>
      )}
    </div>
  );

  const pick = (
    id: string,
    label: string,
    key: 'officer' | 'tier' | 'commitment',
    options: ReadonlyArray<readonly [value: string, label: string]>,
  ) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={form[key]}
        onValueChange={(v) => v && (setError(''), setForm((f) => ({ ...f, [key]: String(v) })))}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue>
            {(v) =>
              v === NONE || !v
                ? tp('notRecorded')
                : (options.find(([value]) => value === v)?.[1] ??
                  // The current officer, before the directory has loaded.
                  (key === 'officer' ? (s.officer?.name ?? tp('notRecorded')) : String(v)))
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{tp('notRecorded')}</SelectItem>
          {options.map(([value, text]) => (
            <SelectItem key={value} value={value}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <section
      aria-labelledby="service"
      className="flex flex-col gap-3 rounded-xl bg-card px-5 py-[18px] ring-1 ring-foreground/10"
    >
      <div className="flex items-center gap-3">
        <h2 id="service" className="min-w-0 grow text-base leading-6 font-medium">
          {t('service')}
        </h2>
        {canEdit && (
          <Button
            variant="outline"
            size="xs"
            className="shrink-0"
            onClick={() => void startEdit()}
            aria-label={t('profile.editGroup', { group: t('service') })}
          >
            {t('profile.edit')}
          </Button>
        )}
      </div>

      {s.officer ? (
        <div className="flex items-center gap-2.5">
          <Avatar name={s.officer.name} size="sm" />
          <span className="flex min-w-0 flex-col gap-px">
            <span className="truncate text-[13px] leading-[18px] font-medium">
              <bdi>{s.officer.name ?? t('officerUnnamed')}</bdi>
            </span>
            <span className="truncate text-xs leading-4 text-muted-foreground">
              <bdi>{t('officerRole', { role: tr(s.officer.role) })}</bdi>
            </span>
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-px">
          <span className="text-xs leading-4 text-muted-foreground">{t('namedOfficer')}</span>
          <span className="text-[13px] leading-[18px] text-neutral-400">{tp('notRecorded')}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-3">
        {fact(t('tier'), s.tier ? tp(`tier.${s.tier}`) : null)}
        {fact(
          t('responseCommitment'),
          s.responseCommitment ? tp(`commitment.${s.responseCommitment}`) : null,
        )}
        {fact(
          t('termEnds'),
          s.termEnd ? date(s.termEnd) : null,
          s.termEnd ? hijri(s.termEnd) : undefined,
        )}
      </div>
      <p className="text-xs leading-4 text-neutral-500">{t('serviceNote')}</p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[520px] [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>{t('service')}</DialogTitle>
            <DialogDescription>{t('serviceForm.hint')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
            {pick(
              'sv-officer',
              t('namedOfficer'),
              'officer',
              staff.map((u) => [u.id, `${u.displayName ?? t('officerUnnamed')} · ${tr(u.role)}`]),
            )}
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              {pick(
                'sv-tier',
                t('tier'),
                'tier',
                SERVICE_TIERS.map((v) => [v, tp(`tier.${v}`)]),
              )}
              {pick(
                'sv-commitment',
                t('responseCommitment'),
                'commitment',
                RESPONSE_COMMITMENTS.map((v) => [v, tp(`commitment.${v}`)]),
              )}
            </div>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sv-start">{t('serviceForm.termStart')}</Label>
                <Input
                  id="sv-start"
                  type="date"
                  value={form.start}
                  onChange={(e) => (
                    setError(''),
                    setForm((f) => ({ ...f, start: e.target.value }))
                  )}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sv-end">{t('serviceForm.termEnd')}</Label>
                <Input
                  id="sv-end"
                  type="date"
                  value={form.end}
                  onChange={(e) => (setError(''), setForm((f) => ({ ...f, end: e.target.value })))}
                />
              </div>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? t('saving') : t('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
