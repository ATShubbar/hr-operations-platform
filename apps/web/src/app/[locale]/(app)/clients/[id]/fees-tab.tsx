'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { MoreHorizontal, Paperclip } from 'lucide-react';
import type { FeeListResponse, FeeReceiptDownloadResponse, FeeResponse } from '@hr/contracts';
import { FEE_AUTHORITIES, type FeeAuthority } from '@hr/contracts/billing-lists';
import { FeeCapture, feeCaptureProblem, type FeeCaptureValue } from '@/components/fee-capture';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useFeeWhat } from '@/lib/fee-what';
import { attachReceipt, receiptProblem, recordFee } from '@/lib/fees';
import { halalasToInput, sarTextToHalalas, useMoney } from '@/lib/money';
import { useCan } from '@/lib/session';
import { toneFor } from '@/lib/status-tone';
import { cn } from '@/lib/utils';
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
import { LoadError, NoAccess } from '@/components/ui/load-state';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusPill } from '@/components/ui/status-pill';
import { Textarea } from '@/components/ui/textarea';
import { toastError, toastSuccess } from '@/components/ui/toast';
import { dateFormat, hijriDate } from '@/lib/dates';
import { dots } from '@/lib/pieces';

// The Client record's Fees tab (BILL-03, ADR-020) — the prototype's: four
// tiles, "Where the money went" by authority, and the fee ledger.
//
// What the figures mean, because money invites misreading:
//   · "Paid on their behalf", "Already recovered", "Filings" and the authority
//     breakdown cover the LAST 90 DAYS, as in the prototype;
//   · "Not yet invoiced" is EVERYTHING still recorded, whatever its age — it
//     is what the client owes for fees, and an old unbilled fee is still owed
//     (the prototype counts only 90 days; this is the one deliberate change);
//   · a void fee is in none of them, and is listed only when asked for.
// Officers and the Administrator add a fee by hand, correct one that is still
// recorded, attach or remove its receipt, and void it with a reason. The
// Auditor reads. Nothing is ever deleted.

type Filter = 'live' | 'recorded' | 'invoiced' | 'void';
const FILTERS: Filter[] = ['live', 'recorded', 'invoiced', 'void'];
const NONE = 'none';
const todayIso = () => new Date().toISOString().slice(0, 10);
const daysAgoIso = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

export function FeesTab({
  clientId,
  people,
}: {
  clientId: string;
  /** The company's people, for a fee recorded by hand against one of them. */
  people: ReadonlyArray<{ id: string; name: string }>;
}) {
  const t = useTranslations('clients.fees');
  const tf = useTranslations('fees');
  const tc = useTranslations('clients');
  const ts = useTranslations('states');
  const locale = useLocale() as 'ar' | 'en';
  const router = useRouter();
  const money = useMoney();
  const canCreate = useCan('fee.create');
  const canUpdate = useCan('fee.update');
  const canVoid = useCan('fee.delete');

  const [fees, setFees] = useState<FeeResponse[] | null>(null);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [filter, setFilter] = useState<Filter>('live');
  const [busy, setBusy] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  async function load() {
    setError('');
    try {
      const res = await apiFetch<FeeListResponse>(`/fees?clientId=${clientId}`);
      setFees(res.fees);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      if (err instanceof ApiError && err.status === 403) return setForbidden(true);
      setError(t('loadError'));
    }
  }
  useEffect(() => {
    void load();
  }, [clientId]);

  const date = (iso: string) =>
    dateFormat(locale === 'ar' ? 'ar' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
      numberingSystem: 'latn',
    }).format(new Date(`${iso}T00:00:00Z`));
  const hijri = (iso: string) => hijriDate(new Date(`${iso}T00:00:00Z`), locale);

  const what = useFeeWhat();

  const figures = useMemo(() => {
    const live = (fees ?? []).filter((f) => f.status !== 'void');
    const since = daysAgoIso(90);
    const recent = live.filter((f) => f.paidOn >= since);
    const sum = (list: FeeResponse[]) => list.reduce((n, f) => n + f.amountHalalas, 0);
    const byAuthority = new Map<string, number>();
    for (const f of recent)
      byAuthority.set(f.authority, (byAuthority.get(f.authority) ?? 0) + f.amountHalalas);
    const total = sum(recent);
    return {
      paid90: total,
      // Everything still owed, whatever its age (see the note above).
      notInvoiced: sum(live.filter((f) => f.status === 'recorded')),
      recovered90: sum(recent.filter((f) => f.status === 'invoiced')),
      filings90: recent.length,
      authorities: [...byAuthority.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([authority, amount]) => ({
          authority,
          amount,
          pct: total ? Math.round((amount / total) * 100) : 0,
        })),
    };
  }, [fees]);

  const shown = (fees ?? []).filter((f) =>
    filter === 'live' ? f.status !== 'void' : f.status === filter,
  );

  // ---- add by hand / correct ----
  const [editing, setEditing] = useState<FeeResponse | 'new' | null>(null);
  const [form, setForm] = useState({
    label: '',
    authority: 'other' as FeeAuthority,
    employeeId: NONE,
    paidOn: '',
  });
  const [paid, setPaid] = useState<FeeCaptureValue>({ amount: '', receipt: null });
  const [formError, setFormError] = useState('');
  function openNew() {
    setForm({ label: '', authority: 'other', employeeId: NONE, paidOn: todayIso() });
    setPaid({ amount: '', receipt: null });
    setFormError('');
    setEditing('new');
  }
  function openEdit(f: FeeResponse) {
    setMenuFor(null);
    setForm({
      label: f.source.kind === 'manual' ? f.source.label : '',
      authority: f.authority,
      employeeId: f.employee?.id ?? NONE,
      paidOn: f.paidOn,
    });
    setPaid({ amount: halalasToInput(f.amountHalalas), receipt: null });
    setFormError('');
    setEditing(f);
  }
  async function submitForm(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const isNew = editing === 'new';
    const manual = isNew || editing.source.kind === 'manual';
    if (manual && !form.label.trim()) return setFormError(t('error.label'));
    if (!form.paidOn || form.paidOn > todayIso()) return setFormError(tf('error.future'));
    const problem = feeCaptureProblem(paid);
    const amountHalalas = sarTextToHalalas(paid.amount) ?? 0;
    if (problem || amountHalalas === 0) return setFormError(tf(`error.${problem ?? 'amount'}`));
    setBusy(true);
    setFormError('');
    try {
      if (isNew) {
        const result = await recordFee({
          source: {
            kind: 'manual',
            clientId,
            label: form.label.trim(),
            ...(form.employeeId !== NONE ? { employeeId: form.employeeId } : {}),
          },
          authority: form.authority,
          amountHalalas,
          paidOn: form.paidOn,
          receipt: paid.receipt,
        });
        if (!result.ok && result.stage === 'fee') return setFormError(t('error.save'));
        if (result.ok) {
          toastSuccess(tf('toast.recorded', { amount: money(amountHalalas), ref: result.fee.ref }));
        } else {
          toastError(tf('toast.receiptFailed', { ref: result.fee.ref }));
        }
      } else {
        // Only what changed.
        const changed: Record<string, unknown> = {};
        if (amountHalalas !== editing.amountHalalas) changed.amountHalalas = amountHalalas;
        if (form.paidOn !== editing.paidOn) changed.paidOn = form.paidOn;
        if (form.authority !== editing.authority) changed.authority = form.authority;
        if (editing.source.kind === 'manual' && form.label.trim() !== editing.source.label) {
          changed.label = form.label.trim();
        }
        if (Object.keys(changed).length) {
          await apiFetch(`/fees/${editing.id}`, { method: 'PATCH', body: JSON.stringify(changed) });
          toastSuccess(t('toast.corrected', { ref: editing.ref }));
        }
      }
      setEditing(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setFormError(
        err instanceof ApiError && err.status === 409 ? t('error.notRecorded') : t('error.save'),
      );
    } finally {
      setBusy(false);
    }
  }

  // ---- void ----
  const [voiding, setVoiding] = useState<FeeResponse | null>(null);
  const [reason, setReason] = useState('');
  const [voidError, setVoidError] = useState('');
  async function submitVoid(e: FormEvent) {
    e.preventDefault();
    if (!voiding) return;
    if (reason.trim().length < 3) return setVoidError(t('error.reason'));
    setBusy(true);
    setVoidError('');
    try {
      await apiFetch(`/fees/${voiding.id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      toastSuccess(t('toast.voided', { ref: voiding.ref }));
      setVoiding(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setVoidError(
        err instanceof ApiError && err.status === 409 ? t('error.cannotVoid') : t('error.save'),
      );
    } finally {
      setBusy(false);
    }
  }

  // ---- receipt ----
  async function openReceipt(f: FeeResponse) {
    try {
      const link = await apiFetch<FeeReceiptDownloadResponse>(`/fees/${f.id}/receipt`);
      window.open(link.url, '_blank', 'noopener');
    } catch {
      toastError(t('error.receiptOpen'));
    }
  }
  async function attach(f: FeeResponse, file: File | null) {
    setMenuFor(null);
    if (!file) return;
    const problem = receiptProblem(file);
    if (problem) return toastError(tf(`error.${problem === 'type' ? 'fileType' : 'fileSize'}`));
    setBusy(true);
    const ok = await attachReceipt(f.id, file);
    if (ok) toastSuccess(t('toast.receiptAttached', { ref: f.ref }));
    else toastError(tf('toast.receiptFailed', { ref: f.ref }));
    await load();
    setBusy(false);
  }
  async function removeReceipt(f: FeeResponse) {
    setMenuFor(null);
    setBusy(true);
    try {
      await apiFetch(`/fees/${f.id}/receipt/remove`, { method: 'POST' });
      toastSuccess(t('toast.receiptRemoved', { ref: f.ref }));
      await load();
    } catch {
      toastError(t('error.save'));
    } finally {
      setBusy(false);
    }
  }

  if (forbidden) return <NoAccess capability="fee.read" />;

  const card = 'rounded-xl bg-card ring-1 ring-foreground/10';
  const tile = (label: string, value: string, sub?: string) => (
    <div className={cn(card, 'flex flex-col gap-[3px] p-4')}>
      <dt className="text-[11px] leading-4 font-medium text-muted-foreground uppercase ltr:tracking-[0.05em]">
        {label}
      </dt>
      <dd className="text-2xl leading-[30px] font-semibold tracking-[-0.02em] tabular-nums">
        <bdi>{value}</bdi>
      </dd>
      {sub && <span className="text-xs leading-4 text-muted-foreground">{sub}</span>}
    </div>
  );
  const isNew = editing === 'new';
  const editingManual = isNew || (editing !== null && editing.source.kind === 'manual');

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <LoadError message={error} onRetry={() => void load()} hasContent={!!fees?.length} />
      )}

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tile(t('tile.paid90'), money(figures.paid90))}
        {tile(t('tile.notInvoiced'), money(figures.notInvoiced), t('tile.notInvoicedSub'))}
        {tile(t('tile.recovered90'), money(figures.recovered90))}
        {tile(t('tile.filings90'), String(figures.filings90))}
      </dl>

      <section
        aria-labelledby="fees-where"
        className={cn(card, 'flex flex-col gap-3 px-5 py-[18px]')}
      >
        <div className="flex flex-col gap-0.5">
          <h2 id="fees-where" className="text-base leading-6 font-medium">
            {t('whereTitle')}
          </h2>
          <p className="text-[13px] leading-[18px] text-muted-foreground">{t('whereSub')}</p>
        </div>
        {figures.authorities.length === 0 ? (
          <p className="text-[13px] leading-[18px] text-neutral-400">{t('whereEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {figures.authorities.map((a) => (
              <li key={a.authority} className="flex items-center gap-3">
                <span className="w-[120px] shrink-0 truncate text-xs leading-4">
                  {tf(`authorityName.${a.authority}`)}
                </span>
                <span
                  aria-hidden
                  className="block h-2 grow overflow-hidden rounded-full bg-neutral-100"
                >
                  <span
                    className="block h-2 rounded-full bg-neutral-900"
                    style={{ width: `${a.pct}%` }}
                  />
                </span>
                <span className="w-[104px] shrink-0 text-end font-mono text-xs">
                  <bdi>{money(a.amount)}</bdi>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="fees-ledger" className={cn(card, 'overflow-hidden')}>
        <div className="flex flex-wrap items-end gap-3 px-4 py-3.5">
          <span className="flex min-w-0 grow basis-56 flex-col gap-0.5">
            <h2 id="fees-ledger" className="text-base leading-6 font-medium">
              {t('ledgerTitle')}
            </h2>
            <span className="text-[13px] leading-[18px] text-muted-foreground">
              {t('ledgerSub')}
            </span>
          </span>
          <div className="flex flex-col gap-1">
            <Label htmlFor="fees-filter" className="text-xs">
              {t('show')}
            </Label>
            <Select value={filter} onValueChange={(v) => v && setFilter(v as Filter)}>
              <SelectTrigger id="fees-filter" className="w-[150px]">
                <SelectValue>{(v) => t(`filter.${String(v)}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {FILTERS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {t(`filter.${f}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {canCreate && (
            <Button variant="outline" size="sm" className="shrink-0" onClick={openNew}>
              {t('add')}
            </Button>
          )}
        </div>

        {fees === null ? (
          <p className="border-t px-4 py-6 text-[13px] text-muted-foreground">{ts('loading')}</p>
        ) : shown.length === 0 ? (
          <p className="border-t px-4 py-8 text-center text-[13px] leading-[18px] text-neutral-400">
            {fees.length === 0 ? t('empty') : t('emptyFiltered')}
          </p>
        ) : (
          <ul>
            {shown.map((f) => {
              const actions = [
                f.receipt?.status === 'available' && {
                  key: 'open',
                  label: t('action.openReceipt'),
                  run: () => (setMenuFor(null), void openReceipt(f)),
                },
                canUpdate &&
                  f.status === 'recorded' && {
                    key: 'edit',
                    label: t('action.correct'),
                    run: () => openEdit(f),
                  },
                canUpdate &&
                  f.receipt?.status === 'available' && {
                    key: 'remove-receipt',
                    label: t('action.removeReceipt'),
                    run: () => void removeReceipt(f),
                  },
                canVoid &&
                  f.status === 'recorded' && {
                    key: 'void',
                    label: t('action.void'),
                    run: () => {
                      setMenuFor(null);
                      setReason('');
                      setVoidError('');
                      setVoiding(f);
                    },
                  },
              ].filter(Boolean) as { key: string; label: string; run: () => void }[];
              // Attaching is offered when there is no usable receipt and the fee is not void.
              const canAttach =
                canUpdate && f.status !== 'void' && f.receipt?.status !== 'available';
              return (
                <li
                  key={f.id}
                  className={cn(
                    'flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t px-4 py-2.5',
                    f.status === 'void' && 'text-muted-foreground',
                  )}
                >
                  <span className="w-[76px] shrink-0 font-mono text-xs">{f.ref}</span>
                  <span className="flex min-w-0 grow basis-52 flex-col gap-px">
                    {/* Wrapped, not truncated: an ellipsis here would hide WHAT was paid
                        for, or that a fee is company-level. */}
                    <span className="text-sm leading-5 font-medium text-pretty">
                      <bdi>{what(f)}</bdi>
                    </span>
                    <span className="text-xs leading-4 text-pretty text-muted-foreground">
                      <bdi>
                        {dots(
                          locale,
                          tf(`authorityName.${f.authority}`),
                          f.employee
                            ? locale === 'ar'
                              ? f.employee.name.ar
                              : f.employee.name.en
                            : t('companyLevel'),
                        )}
                      </bdi>
                    </span>
                    {f.voided && (
                      <span className="text-xs leading-4 text-muted-foreground">
                        <bdi>
                          {t('voidedLine', {
                            reason:
                              f.voided.reason === 'system:step-reopened'
                                ? t('reasonStepReopened')
                                : f.voided.reason,
                          })}
                        </bdi>
                      </span>
                    )}
                  </span>
                  <span className="flex w-[104px] shrink-0 flex-col">
                    <span className="text-[13px] leading-[17px] whitespace-nowrap">
                      {date(f.paidOn)}
                    </span>
                    <span className="font-mono text-[10px] leading-[14px] whitespace-nowrap text-neutral-400">
                      {hijri(f.paidOn)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'w-[96px] shrink-0 text-end font-mono text-[13px] whitespace-nowrap',
                      f.status === 'void' && 'line-through',
                    )}
                  >
                    <bdi>{money(f.amountHalalas)}</bdi>
                  </span>
                  <span className="flex w-[92px] shrink-0 justify-end">
                    <StatusPill tone={toneFor('fee', f.status)}>
                      {t(`status.${f.status}`)}
                    </StatusPill>
                  </span>
                  <span className="flex w-[60px] shrink-0 items-center justify-end gap-1">
                    {f.receipt?.status === 'available' && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void openReceipt(f)}
                        aria-label={t('receiptFor', { ref: f.ref })}
                        title={f.receipt.fileName}
                      >
                        <Paperclip />
                      </Button>
                    )}
                    {(actions.length > 0 || canAttach) && (
                      <Popover
                        open={menuFor === f.id}
                        onOpenChange={(o) => setMenuFor(o ? f.id : null)}
                      >
                        <PopoverTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={busy}
                              aria-label={t('actionsFor', { ref: f.ref })}
                            />
                          }
                        >
                          <MoreHorizontal />
                        </PopoverTrigger>
                        <PopoverContent align="end" className="flex w-52 flex-col gap-0.5 p-1">
                          {actions.map((a) => (
                            <button
                              key={a.key}
                              type="button"
                              onClick={a.run}
                              className="flex min-h-9 items-center rounded-md px-2.5 text-start text-[13px] outline-none hover:bg-neutral-100 focus-visible:bg-neutral-100"
                            >
                              {a.label}
                            </button>
                          ))}
                          {canAttach && (
                            <label className="flex min-h-9 cursor-pointer items-center rounded-md px-2.5 text-[13px] focus-within:bg-neutral-100 hover:bg-neutral-100">
                              {t('action.attachReceipt')}
                              <input
                                type="file"
                                accept="application/pdf,image/jpeg,image/png"
                                className="sr-only"
                                onChange={(e) => void attach(f, e.target.files?.[0] ?? null)}
                              />
                            </label>
                          )}
                        </PopoverContent>
                      </Popover>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="border-t px-4 py-2.5 text-xs leading-4 text-muted-foreground">{t('note')}</p>
      </section>

      {/* ---- add by hand / correct ---- */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-[500px] [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>
              {isNew ? t('addTitle') : t('correctTitle', { ref: editing?.ref ?? '' })}
            </DialogTitle>
            <DialogDescription>{isNew ? t('addHint') : t('correctHint')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitForm} className="flex flex-col gap-3.5" noValidate>
            {editingManual && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fee-label">{t('label')}</Label>
                <Input
                  id="fee-label"
                  value={form.label}
                  maxLength={160}
                  placeholder={t('labelPlaceholder')}
                  onChange={(e) => (
                    setFormError(''),
                    setForm((s) => ({ ...s, label: e.target.value }))
                  )}
                />
              </div>
            )}
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fee-authority">{tf('authority')}</Label>
                <Select
                  value={form.authority}
                  onValueChange={(v) =>
                    v && setForm((s) => ({ ...s, authority: v as FeeAuthority }))
                  }
                >
                  <SelectTrigger id="fee-authority" className="w-full">
                    <SelectValue>{(v) => tf(`authorityName.${String(v)}`)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {FEE_AUTHORITIES.map((a) => (
                      <SelectItem key={a} value={a}>
                        {tf(`authorityName.${a}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fee-paid-on">{tf('paidOn')}</Label>
                <Input
                  id="fee-paid-on"
                  type="date"
                  max={todayIso()}
                  value={form.paidOn}
                  onChange={(e) => (
                    setFormError(''),
                    setForm((s) => ({ ...s, paidOn: e.target.value }))
                  )}
                />
              </div>
            </div>
            {isNew && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fee-employee">{t('employee')}</Label>
                <Select
                  value={form.employeeId}
                  onValueChange={(v) => v && setForm((s) => ({ ...s, employeeId: String(v) }))}
                >
                  <SelectTrigger id="fee-employee" className="w-full">
                    <SelectValue>
                      {(v) =>
                        v === NONE || !v
                          ? t('companyLevel')
                          : (people.find((p) => p.id === v)?.name ?? t('companyLevel'))
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('companyLevel')}</SelectItem>
                    {people.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {isNew ? (
              <FeeCapture
                id="fee-new"
                value={paid}
                onChange={(next) => (setFormError(''), setPaid(next))}
                standardHalalas={0}
              />
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fee-amount">{tf('amountPaid')}</Label>
                <Input
                  id="fee-amount"
                  dir="ltr"
                  inputMode="decimal"
                  value={paid.amount}
                  onChange={(e) => (
                    setFormError(''),
                    setPaid({ amount: e.target.value, receipt: null })
                  )}
                  className="font-mono"
                />
              </div>
            )}
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                {tc('cancel')}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? tc('saving') : isNew ? tf('record') : tc('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---- void ---- */}
      <Dialog open={voiding !== null} onOpenChange={(o) => !o && setVoiding(null)}>
        <DialogContent className="sm:max-w-[460px] [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>{t('voidTitle', { ref: voiding?.ref ?? '' })}</DialogTitle>
            <DialogDescription>
              {voiding ? t('voidHint', { amount: money(voiding.amountHalalas) }) : ''}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitVoid} className="flex flex-col gap-3.5" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fee-void-reason">{t('voidReason')}</Label>
              <Textarea
                id="fee-void-reason"
                rows={3}
                maxLength={300}
                value={reason}
                onChange={(e) => (setVoidError(''), setReason(e.target.value))}
              />
            </div>
            {voidError && (
              <p role="alert" className="text-sm text-destructive">
                {voidError}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setVoiding(null)}>
                {t('voidKeep')}
              </Button>
              <Button type="submit" variant="destructive" disabled={busy}>
                {t('voidConfirm')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
