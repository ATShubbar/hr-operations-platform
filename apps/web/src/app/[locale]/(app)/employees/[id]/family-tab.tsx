'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Ellipsis } from 'lucide-react';
import type { DependantListResponse, DependantResponse } from '@hr/contracts';
import { formatHijri } from '@hr/dates';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import type { Locale } from '@/lib/employee-format';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
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
import { LoadError, NoAccess } from '@/components/ui/load-state';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { toastSuccess } from '@/components/ui/toast';
import { DependantDialog } from './dependant-dialog';

// The Person record's Family tab (DEP-03, ADR-017) — the prototype's: a header
// card (how many dependants are sponsored, Add a dependant), then one card per
// dependant — avatar, both names, "Spouse · 34 years", the iqama number — over
// its three documents (iqama, passport, insurance), each with the Gregorian and
// Hijri date, the People screen's days-left chip and Renew inside 90 days.
//
// Owner decisions carried here: the annual dependant FEE is not shown (Billing,
// "coming soon"); expiries live on the record only (no alerts or runway yet).
// The iqama number is masked for readers without govdata.read — the API sends
// null plus `identifierVisible: false`, and the tab says it is hidden rather
// than showing nothing. Changes (Add, Edit, Remove, Renew) need govdata.update.
// Edit and Remove are ours, not the prototype's: a dependant can be corrected
// or taken off, and Remove keeps the row in history (soft).

type DocKey = 'iqama' | 'passport' | 'insurance';
const DOCS: Array<{
  key: DocKey;
  field: 'iqamaExpiry' | 'passportExpiry' | 'insuranceExpiry';
  months: number;
}> = [
  { key: 'iqama', field: 'iqamaExpiry', months: 12 },
  { key: 'passport', field: 'passportExpiry', months: 60 },
  { key: 'insurance', field: 'insuranceExpiry', months: 12 },
];

function daysTo(iso: string): number {
  const target = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}
function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
const todayIso = () => new Date().toISOString().slice(0, 10);
function ageOf(iso: string): number {
  const born = new Date(`${iso}T00:00:00Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const m = now.getUTCMonth() - born.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < born.getUTCDate())) age -= 1;
  return age;
}
// The prototype's chip scale (shared with the People list and the Documents tab).
function chipClass(days: number): string {
  if (days <= 7) return 'bg-status-critical-surface text-status-critical';
  if (days <= 14) return 'bg-status-warning-surface text-status-warning';
  if (days <= 30) return 'bg-neutral-100 text-neutral-700';
  return 'bg-transparent text-neutral-400';
}
/** "2400000101" → "2 400 000 101", the prototype's grouping. */
const grouped = (n: string) =>
  n.length === 10 ? `${n[0]} ${n.slice(1, 4)} ${n.slice(4, 7)} ${n.slice(7)}` : n;

export function FamilyTab({
  employeeId,
  sponsorName,
  terminated,
}: {
  employeeId: string;
  sponsorName: string;
  terminated: boolean;
}) {
  const t = useTranslations('person.family');
  const tp = useTranslations('people');
  const ts = useTranslations('states');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const canWrite = useCan('govdata.update') && !terminated;

  const [rows, setRows] = useState<DependantResponse[] | null>(null);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  async function load() {
    setError('');
    try {
      const res = await apiFetch<DependantListResponse>(`/employees/${employeeId}/dependants`);
      setRows(res.dependants);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      if (err instanceof ApiError && err.status === 403) return setForbidden(true);
      setError(t('loadError'));
    }
  }
  useEffect(() => {
    void load();
  }, [employeeId]);

  const day = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
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
  const hijri = (iso: string) => formatHijri(new Date(`${iso}T00:00:00Z`), locale);
  const chipText = (days: number) =>
    days < 0 ? tp('over', { n: Math.abs(days) }) : tp('left', { n: days });
  const nameOf = (d: DependantResponse) => (locale === 'ar' && d.nameAr ? d.nameAr : d.nameEn);

  // ---- add / edit ----
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DependantResponse | null>(null);
  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (d: DependantResponse) => {
    setEditing(d);
    setDialogOpen(true);
  };
  const onSaved = (saved: DependantResponse, created: boolean) => {
    void load();
    toastSuccess(created ? t('dialog.added', { name: nameOf(saved) }) : t('dialog.saved'));
  };

  // ---- remove ----
  const [removing, setRemoving] = useState<DependantResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [removeError, setRemoveError] = useState('');
  async function confirmRemove() {
    if (!removing) return;
    setBusy(true);
    setRemoveError('');
    try {
      await apiFetch(`/employees/${employeeId}/dependants/${removing.id}/remove`, {
        method: 'POST',
      });
      toastSuccess(t('removed', { name: nameOf(removing) }));
      setRemoving(null);
      void load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setRemoveError(t('removeError'));
    } finally {
      setBusy(false);
    }
  }

  // ---- renew ----
  const [renew, setRenew] = useState<{ dep: DependantResponse; doc: (typeof DOCS)[number] } | null>(
    null,
  );
  const [newIso, setNewIso] = useState('');
  const [renewing, setRenewing] = useState(false);
  const [renewError, setRenewError] = useState('');
  const openRenew = (dep: DependantResponse, doc: (typeof DOCS)[number]) => {
    const current = dep[doc.field];
    const base = current && daysTo(current) > 0 ? current : todayIso();
    setNewIso(addMonths(base, doc.months));
    setRenewError('');
    setRenew({ dep, doc });
  };
  async function submitRenew() {
    if (!renew || !newIso) return;
    if (daysTo(newIso) <= 0) return setRenewError(t('renewPast'));
    setRenewing(true);
    setRenewError('');
    try {
      await apiFetch(`/employees/${employeeId}/dependants/${renew.dep.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ [renew.doc.field]: newIso }),
      });
      toastSuccess(
        t('renewed', {
          label: t(`doc.${renew.doc.key}`),
          name: nameOf(renew.dep),
          date: day(newIso),
        }),
      );
      setRenew(null);
      void load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setRenewError(t('renewError'));
    } finally {
      setRenewing(false);
    }
  }

  if (forbidden) return <NoAccess capability="employee.read" />;

  const card = 'rounded-xl bg-card ring-1 ring-foreground/10';

  return (
    <div className="flex flex-col gap-4">
      <div className={cn(card, 'flex items-center gap-3 px-5 py-4')}>
        <span className="flex min-w-0 grow flex-col gap-0.5">
          <h2 className="text-base leading-6 font-medium">{t('title')}</h2>
          {/* Isolated: an Arabic sentence that OPENS with a digit ("3 مُعالين…")
              otherwise puts the digit at the wrong end of the LTR line (ADR-012).
              The bdi sits inside a span so its own direction never flips the
              line's alignment (THREAD-02 landmine). */}
          <span className="text-[13px] leading-[18px] text-pretty text-muted-foreground">
            <bdi>
              {rows === null
                ? ts('loading')
                : rows.length === 0
                  ? t('emptySummary')
                  : `${t('summary', { count: rows.length })} · ${t('feeSoon')}`}
            </bdi>
          </span>
        </span>
        {canWrite && (
          <Button variant="outline" size="sm" onClick={openAdd} className="shrink-0">
            {t('add')}
          </Button>
        )}
      </div>

      {error && (
        <LoadError message={error} onRetry={() => void load()} hasContent={!!rows?.length} />
      )}

      {rows === null && !error ? (
        <SkeletonRegion label={ts('loading')}>
          <Skeleton className="h-40 w-full rounded-xl" />
        </SkeletonRegion>
      ) : rows && rows.length === 0 ? (
        <div
          className={cn(card, 'px-5 py-8 text-center text-[13px] leading-[18px] text-neutral-400')}
        >
          {t('nothing')}
        </div>
      ) : (
        rows?.map((d) => (
          <div key={d.id} className={cn(card, 'overflow-hidden')}>
            <div className="flex items-center gap-3 px-5 py-3.5">
              <Avatar name={d.nameEn} size="md" />
              <span className="flex min-w-0 grow flex-col gap-px">
                <span className="truncate text-sm leading-5 font-medium">{d.nameEn}</span>
                {d.nameAr && (
                  <span
                    dir="rtl"
                    className="w-fit truncate text-xs leading-4 text-muted-foreground"
                  >
                    {d.nameAr}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-px">
                <span className="text-xs leading-4 text-muted-foreground">
                  {t(`relationship.${d.relationship}`)} ·{' '}
                  {d.dateOfBirth ? t('age', { n: ageOf(d.dateOfBirth) }) : t('ageUnknown')}
                </span>
                {!d.identifierVisible ? (
                  <span
                    className="font-mono text-[11px] leading-[15px] text-neutral-400"
                    title={t('hidden')}
                  >
                    <span aria-hidden>••• ••• •••</span>
                    <span className="sr-only">{t('hidden')}</span>
                  </span>
                ) : d.iqamaNumber ? (
                  <bdi dir="ltr" className="font-mono text-[11px] leading-[15px]">
                    {grouped(d.iqamaNumber)}
                  </bdi>
                ) : (
                  <span className="text-[11px] leading-[15px] text-neutral-400">
                    {t('notIssued')}
                  </span>
                )}
              </span>
              {canWrite && (
                <RowMenu
                  label={t('more', { name: d.nameEn })}
                  items={[
                    { key: 'edit', label: t('edit'), run: () => openEdit(d) },
                    { key: 'remove', label: t('remove'), run: () => setRemoving(d) },
                  ]}
                />
              )}
            </div>
            {/* The prototype's 1.4fr 1fr 96px 88px from `sm`. On a phone the date moves
                under the document's name, so the chip and Renew stay on screen (a
                sideways-scrolling grid put Renew 97px out of view at 375px). */}
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] sm:grid-cols-[1.4fr_1fr_96px_88px]">
              {DOCS.map((doc) => {
                const iso = d[doc.field];
                const days = iso ? daysTo(iso) : null;
                const renewable = canWrite && days !== null && days <= 90;
                const cell = 'flex min-h-11 items-center border-t sm:h-11';
                const date = iso ? (
                  <>
                    <span className="text-xs leading-4">{day(iso)}</span>
                    <span className="text-[10px] leading-[14px] text-neutral-400">
                      {hijri(iso)}
                    </span>
                  </>
                ) : (
                  <span className="text-xs leading-4 text-neutral-400">{t('notOnFile')}</span>
                );
                return (
                  <div key={doc.key} className="contents">
                    <span
                      className={cn(
                        cell,
                        'flex-col items-start justify-center px-4 py-1.5 sm:px-5 sm:py-0',
                      )}
                    >
                      <span className="text-[13px] leading-[18px]">{t(`doc.${doc.key}`)}</span>
                      <span className="flex flex-col sm:hidden">{date}</span>
                    </span>
                    <span
                      className={cn(cell, 'hidden flex-col items-end justify-center px-3 sm:flex')}
                    >
                      {date}
                    </span>
                    <span className={cn(cell, 'justify-center px-2')}>
                      {days !== null ? (
                        <span
                          className={cn(
                            'inline-flex h-5 shrink-0 items-center rounded-full px-2 font-mono text-[11px] leading-5 whitespace-nowrap',
                            chipClass(days),
                          )}
                        >
                          {chipText(days)}
                        </span>
                      ) : (
                        <span className="font-mono text-[11px] text-neutral-400">—</span>
                      )}
                    </span>
                    <span className={cn(cell, 'justify-end ps-1 pe-4 sm:px-5')}>
                      {renewable && (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => openRenew(d, doc)}
                          aria-label={`${t('renew')} — ${t(`doc.${doc.key}`)} — ${d.nameEn}`}
                        >
                          {t('renew')}
                        </Button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      <DependantDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        employeeId={employeeId}
        sponsorName={sponsorName}
        editing={editing}
        onSaved={onSaved}
      />

      {/* ---- Remove ---- */}
      <Dialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>
              {removing ? t('removeTitle', { name: nameOf(removing) }) : ''}
            </DialogTitle>
            <DialogDescription>{t('removeBody')}</DialogDescription>
          </DialogHeader>
          {removeError && (
            <p role="alert" className="text-sm text-destructive">
              {removeError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRemoving(null)}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => void confirmRemove()}
            >
              {busy ? t('removing') : t('removeConfirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- Renew ---- */}
      <Dialog open={renew !== null} onOpenChange={(o) => !o && setRenew(null)}>
        <DialogContent className="sm:max-w-[440px] [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>{t('renewTitle')}</DialogTitle>
            <DialogDescription>
              {renew ? `${t(`doc.${renew.doc.key}`)} · ${nameOf(renew.dep)}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dep-renew">{t('newExpiry')}</Label>
            <Input
              id="dep-renew"
              type="date"
              value={newIso}
              onChange={(e) => setNewIso(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">
              {newIso && !Number.isNaN(Date.parse(newIso)) ? hijri(newIso) : ''}
            </span>
          </div>
          {renewError && (
            <p role="alert" className="text-sm text-destructive">
              {renewError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRenew(null)}>
              {t('cancel')}
            </Button>
            <Button size="sm" disabled={renewing || !newIso} onClick={() => void submitRenew()}>
              {renewing ? t('saving') : t('save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RowMenu({
  label,
  items,
}: {
  label: string;
  items: Array<{ key: string; label: string; run: () => void }>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} />}>
        <Ellipsis />
      </PopoverTrigger>
      <PopoverContent className="w-40 p-1">
        <ul className="flex flex-col">
          {items.map((m) => (
            <li key={m.key}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  m.run();
                }}
                className="w-full rounded-md px-2.5 py-1.5 text-start text-[13px] leading-[18px] hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                {m.label}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
