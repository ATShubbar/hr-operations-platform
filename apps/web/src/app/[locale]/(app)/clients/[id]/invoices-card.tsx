'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { MoreHorizontal } from 'lucide-react';
import type {
  FeeListResponse,
  FeeResponse,
  InvoiceListResponse,
  InvoiceResponse,
} from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useFeeWhat } from '@/lib/fee-what';
import { halalasToInput, sarTextToHalalas, useMoney } from '@/lib/money';
import { useCan } from '@/lib/session';
import { toneFor } from '@/lib/status-tone';
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
import { LoadError } from '@/components/ui/load-state';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { StatusPill } from '@/components/ui/status-pill';
import { toastSuccess } from '@/components/ui/toast';
import { dateFormat, hijriDate } from '@/lib/dates';
import { dots } from '@/lib/pieces';

// Invoice RECORDS on the Commercial tab (BILL-05, ADR-020).
//
// The invoice is issued from the accounting system. What is kept here is the
// record of it — its number as issued, its dates and its amount — the fees it
// recovers, and whether it has been paid. Nothing is numbered, rendered or
// taxed by this screen, and the card says so.
//
//   · ticking a fee puts it ON the invoice: it becomes "Invoiced" on the Fees
//     tab and leaves "not yet recovered"; un-ticking it sends it back;
//   · "Overdue" is worked out by the server from the due date — nobody sets it;
//   · a paid record is settled: it is un-marked before it can be corrected;
//   · a record is removed only when it was entered in error — unpaid, and
//     recovering no fee. Otherwise it is corrected.
// The Administrator writes (`billing.update`); the Auditor reads.

const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

interface InvoiceForm {
  number: string;
  issuedOn: string;
  dueOn: string;
  amount: string;
  feeIds: string[];
}

export function InvoicesCard({
  clientId,
  paymentTermsDays,
  onChanged,
}: {
  clientId: string;
  /** From the commercial terms — prefills the due date. Null when none are recorded. */
  paymentTermsDays: number | null;
  /** The standing and "not yet recovered" live in the summary: reload it. */
  onChanged: () => void;
}) {
  const t = useTranslations('clients.commercial.inv');
  const tc = useTranslations('clients');
  const ts = useTranslations('states');
  const locale = useLocale() as 'ar' | 'en';
  const router = useRouter();
  const money = useMoney();
  const what = useFeeWhat();
  const canEdit = useCan('billing.update');

  const [invoices, setInvoices] = useState<InvoiceResponse[] | null>(null);
  const [fees, setFees] = useState<FeeResponse[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  async function load() {
    setError('');
    try {
      const [inv, fee] = await Promise.all([
        apiFetch<InvoiceListResponse>(`/billing/clients/${clientId}/invoices`),
        apiFetch<FeeListResponse>(`/fees?clientId=${clientId}`),
      ]);
      setInvoices(inv.invoices);
      setFees(fee.fees);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
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
  // ADR-012 lays the page out left to right in both languages: a whole Arabic
  // line is isolated so a figure it opens with stays where it was written.
  const whole = (text: string) => (
    <span>
      <bdi>{text}</bdi>
    </span>
  );

  async function changed(message: string) {
    toastSuccess(message);
    await load();
    onChanged();
  }
  const refusal = (err: unknown, fallback: string) =>
    err instanceof ApiError && err.status === 409 ? fallback : t('error.save');

  // ---- record / correct ----
  const [editing, setEditing] = useState<InvoiceResponse | 'new' | null>(null);
  const [form, setForm] = useState<InvoiceForm>({
    number: '',
    issuedOn: '',
    dueOn: '',
    amount: '',
    feeIds: [],
  });
  const [formError, setFormError] = useState('');
  // The due date follows the issue date until someone sets it themselves.
  const [dueTouched, setDueTouched] = useState(false);
  const set = (patch: Partial<InvoiceForm>) => (
    setFormError(''),
    setForm((f) => ({ ...f, ...patch }))
  );

  function openNew() {
    const issuedOn = todayIso();
    setFormError('');
    setDueTouched(false);
    setForm({
      number: '',
      issuedOn,
      dueOn: addDays(issuedOn, paymentTermsDays ?? 30),
      amount: '',
      feeIds: [],
    });
    setEditing('new');
  }
  function openEdit(inv: InvoiceResponse) {
    setMenuFor(null);
    setFormError('');
    setDueTouched(true);
    setForm({
      number: inv.number,
      issuedOn: inv.issuedOn,
      dueOn: inv.dueOn,
      amount: halalasToInput(inv.amountHalalas),
      feeIds: inv.fees.map((f) => f.id),
    });
    setEditing(inv);
  }

  // The fees this record may carry: those still waiting, plus its own.
  const own = new Set(editing && editing !== 'new' ? editing.fees.map((f) => f.id) : []);
  const offered = fees.filter((f) => f.status === 'recorded' || own.has(f.id));
  const ticked = offered.filter((f) => form.feeIds.includes(f.id));
  const tickedTotal = ticked.reduce((n, f) => n + f.amountHalalas, 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (!form.number.trim()) return setFormError(t('error.number'));
    if (!form.issuedOn || !form.dueOn) return setFormError(t('error.dates'));
    if (form.issuedOn > todayIso()) return setFormError(t('error.future'));
    if (form.dueOn < form.issuedOn) return setFormError(t('error.dueBeforeIssue'));
    const amountHalalas = sarTextToHalalas(form.amount);
    if (amountHalalas === null || amountHalalas <= 0) return setFormError(t('error.amount'));
    setBusy(true);
    setFormError('');
    try {
      if (editing === 'new') {
        await apiFetch(`/billing/clients/${clientId}/invoices`, {
          method: 'POST',
          body: JSON.stringify({
            number: form.number.trim(),
            issuedOn: form.issuedOn,
            dueOn: form.dueOn,
            amountHalalas,
            feeIds: form.feeIds,
          }),
        });
        setEditing(null);
        await changed(t('toast.recorded', { number: form.number.trim() }));
      } else {
        // Only what changed.
        const body: Record<string, unknown> = {};
        if (form.number.trim() !== editing.number) body.number = form.number.trim();
        if (form.issuedOn !== editing.issuedOn) body.issuedOn = form.issuedOn;
        if (form.dueOn !== editing.dueOn) body.dueOn = form.dueOn;
        if (amountHalalas !== editing.amountHalalas) body.amountHalalas = amountHalalas;
        const before = [...own].sort().join();
        if ([...form.feeIds].sort().join() !== before) body.feeIds = form.feeIds;
        if (Object.keys(body).length) {
          await apiFetch(`/billing/invoices/${editing.id}`, {
            method: 'PATCH',
            body: JSON.stringify(body),
          });
          setEditing(null);
          await changed(t('toast.corrected', { number: form.number.trim() }));
        } else {
          setEditing(null);
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setFormError(
        err instanceof ApiError && err.status === 400
          ? t('error.invalid')
          : refusal(err, t('error.conflict')),
      );
    } finally {
      setBusy(false);
    }
  }

  // ---- mark paid ----
  const [paying, setPaying] = useState<InvoiceResponse | null>(null);
  const [paidOn, setPaidOn] = useState('');
  const [payError, setPayError] = useState('');
  async function submitPaid(e: FormEvent) {
    e.preventDefault();
    if (!paying) return;
    if (!paidOn) return setPayError(t('error.paidOn'));
    if (paidOn > todayIso()) return setPayError(t('error.paidFuture'));
    if (paidOn < paying.issuedOn) return setPayError(t('error.paidBeforeIssue'));
    setBusy(true);
    setPayError('');
    try {
      await apiFetch(`/billing/invoices/${paying.id}/paid`, {
        method: 'POST',
        body: JSON.stringify({ paidOn }),
      });
      const number = paying.number;
      setPaying(null);
      await changed(t('toast.paid', { number }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setPayError(refusal(err, t('error.alreadyPaid')));
    } finally {
      setBusy(false);
    }
  }

  async function markUnpaid(inv: InvoiceResponse) {
    setMenuFor(null);
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/billing/invoices/${inv.id}/unpaid`, { method: 'POST' });
      await changed(t('toast.unpaid', { number: inv.number }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('error.save'));
    } finally {
      setBusy(false);
    }
  }

  // ---- remove ----
  const [removing, setRemoving] = useState<InvoiceResponse | null>(null);
  const [removeError, setRemoveError] = useState('');
  async function confirmRemove() {
    if (!removing) return;
    setBusy(true);
    setRemoveError('');
    try {
      await apiFetch(`/billing/invoices/${removing.id}/remove`, { method: 'POST' });
      const number = removing.number;
      setRemoving(null);
      await changed(t('toast.removed', { number }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setRemoveError(refusal(err, t('error.cannotRemove')));
    } finally {
      setBusy(false);
    }
  }

  const stateOf = (inv: InvoiceResponse) => (inv.overdue ? 'overdue' : inv.status);

  return (
    <section
      aria-labelledby="cm-inv"
      className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4">
        <span className="flex min-w-0 grow basis-52 flex-col gap-0.5">
          <h2 id="cm-inv" className="text-base leading-6 font-medium">
            {t('title')}
          </h2>
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {whole(t('sub'))}
          </span>
        </span>
        {canEdit && (
          <Button variant="outline" size="sm" className="shrink-0" onClick={openNew}>
            {t('add')}
          </Button>
        )}
      </div>

      {error && (
        <div className="border-t px-5 py-3">
          <LoadError message={error} onRetry={() => void load()} hasContent />
        </div>
      )}

      {invoices === null ? (
        !error && (
          <p className="border-t px-5 py-6 text-[13px] text-muted-foreground">{ts('loading')}</p>
        )
      ) : invoices.length === 0 ? (
        <p className="border-t px-5 py-8 text-center text-[13px] leading-[18px] text-neutral-400">
          {whole(canEdit ? t('empty') : t('emptyReadOnly'))}
        </p>
      ) : (
        <ul>
          {invoices.map((inv) => {
            const actions = canEdit
              ? ([
                  inv.status === 'sent' && {
                    key: 'paid',
                    label: t('action.paid'),
                    run: () => {
                      setMenuFor(null);
                      setPayError('');
                      setPaidOn(todayIso());
                      setPaying(inv);
                    },
                  },
                  inv.status === 'sent' && {
                    key: 'edit',
                    label: t('action.correct'),
                    run: () => openEdit(inv),
                  },
                  inv.status === 'paid' && {
                    key: 'unpaid',
                    label: t('action.unpaid'),
                    run: () => void markUnpaid(inv),
                  },
                  inv.status === 'sent' &&
                    inv.fees.length === 0 && {
                      key: 'remove',
                      label: t('action.remove'),
                      run: () => {
                        setMenuFor(null);
                        setRemoveError('');
                        setRemoving(inv);
                      },
                    },
                ].filter(Boolean) as { key: string; label: string; run: () => void }[])
              : [];
            return (
              <li
                key={inv.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t px-5 py-2.5"
              >
                <span className="flex min-w-0 grow basis-44 flex-col gap-px">
                  <span className="font-mono text-xs break-all">
                    <bdi dir="ltr">{inv.number}</bdi>
                  </span>
                  <span className="text-xs leading-4 text-pretty text-muted-foreground">
                    {whole(
                      inv.fees.length
                        ? t('recovers', {
                            count: inv.fees.length,
                            amount: money(inv.feesHalalas),
                          })
                        : t('recoversNone'),
                    )}
                  </span>
                </span>
                <span className="flex w-[112px] shrink-0 flex-col">
                  <span className="text-[13px] leading-[17px] whitespace-nowrap">
                    {whole(date(inv.issuedOn))}
                  </span>
                  <span className="text-[11px] leading-[15px] whitespace-nowrap text-muted-foreground">
                    {whole(
                      inv.paidOn
                        ? t('paidOn', { date: date(inv.paidOn) })
                        : t('dueOn', { date: date(inv.dueOn) }),
                    )}
                  </span>
                </span>
                <span className="w-[104px] shrink-0 text-end font-mono text-[13px] whitespace-nowrap">
                  <bdi>{money(inv.amountHalalas)}</bdi>
                </span>
                <span className="flex w-[84px] shrink-0 justify-end">
                  <StatusPill tone={toneFor('invoice', stateOf(inv))}>
                    {t(`status.${stateOf(inv)}`)}
                  </StatusPill>
                </span>
                <span className="flex w-8 shrink-0 justify-end">
                  {actions.length > 0 && (
                    <Popover
                      open={menuFor === inv.id}
                      onOpenChange={(o) => setMenuFor(o ? inv.id : null)}
                    >
                      <PopoverTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={busy}
                            aria-label={t('actionsFor', { number: inv.number })}
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
                      </PopoverContent>
                    </Popover>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="border-t px-5 py-3 text-xs leading-4 text-neutral-500">{whole(t('note'))}</p>

      {/* record / correct */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-[560px] [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? t('addTitle') : t('correctTitle')}</DialogTitle>
            <DialogDescription>{t('formHint')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="inv-number">{t('form.number')}</Label>
                <Input
                  id="inv-number"
                  dir="ltr"
                  maxLength={40}
                  value={form.number}
                  onChange={(e) => set({ number: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="inv-amount">{t('form.amount')}</Label>
                <Input
                  id="inv-amount"
                  dir="ltr"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => set({ amount: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="inv-issued">{t('form.issuedOn')}</Label>
                <Input
                  id="inv-issued"
                  type="date"
                  max={todayIso()}
                  value={form.issuedOn}
                  onChange={(e) =>
                    set({
                      issuedOn: e.target.value,
                      ...(!dueTouched && e.target.value
                        ? { dueOn: addDays(e.target.value, paymentTermsDays ?? 30) }
                        : {}),
                    })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="inv-due">{t('form.dueOn')}</Label>
                <Input
                  id="inv-due"
                  type="date"
                  value={form.dueOn}
                  onChange={(e) => (setDueTouched(true), set({ dueOn: e.target.value }))}
                />
              </div>
            </div>
            {/* Only for a new record: a correction keeps the due date it has. */}
            {editing === 'new' && (
              <p className="text-xs leading-4 text-neutral-500">
                {whole(
                  paymentTermsDays === null
                    ? t('form.dueHintNoTerms')
                    : t('form.dueHint', { count: paymentTermsDays }),
                )}
              </p>
            )}

            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm leading-5 font-medium">{t('form.fees')}</legend>
              {offered.length === 0 ? (
                <p className="text-[13px] leading-[18px] text-muted-foreground">
                  {whole(t('form.noFees'))}
                </p>
              ) : (
                <ul className="max-h-48 overflow-y-auto rounded-lg ring-1 ring-foreground/10">
                  {offered.map((f) => (
                    <li key={f.id} className="border-t first:border-t-0">
                      <label className="flex min-h-11 items-center gap-2.5 px-3 py-1.5 text-[13px] leading-[18px]">
                        <input
                          type="checkbox"
                          className="size-4 shrink-0 accent-neutral-900"
                          checked={form.feeIds.includes(f.id)}
                          onChange={(e) =>
                            set({
                              feeIds: e.target.checked
                                ? [...form.feeIds, f.id]
                                : form.feeIds.filter((x) => x !== f.id),
                            })
                          }
                        />
                        <span className="flex min-w-0 grow flex-col">
                          <span className="text-pretty">
                            <bdi>{what(f)}</bdi>
                          </span>
                          <span className="font-mono text-[11px] leading-[15px] text-muted-foreground">
                            {dots(locale, f.ref, date(f.paidOn))}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-xs whitespace-nowrap">
                          <bdi>{money(f.amountHalalas)}</bdi>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {offered.length > 0 && (
                <p className="text-xs leading-4 text-neutral-500" aria-live="polite">
                  {whole(t('form.feesTotal', { count: ticked.length, amount: money(tickedTotal) }))}
                </p>
              )}
            </fieldset>

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
                {busy ? tc('saving') : tc('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* mark paid */}
      <Dialog open={paying !== null} onOpenChange={(o) => !o && setPaying(null)}>
        <DialogContent className="sm:max-w-[420px] [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>{t('paidTitle')}</DialogTitle>
            <DialogDescription>
              {paying && (
                <bdi>
                  {t('paidHint', { number: paying.number, amount: money(paying.amountHalalas) })}
                </bdi>
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitPaid} className="flex flex-col gap-3.5" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-paid-on">{t('form.paidOn')}</Label>
              <Input
                id="inv-paid-on"
                type="date"
                max={todayIso()}
                min={paying?.issuedOn}
                value={paidOn}
                onChange={(e) => (setPayError(''), setPaidOn(e.target.value))}
              />
              {paidOn && (
                <span className="text-[11px] leading-[15px] text-neutral-400">{hijri(paidOn)}</span>
              )}
            </div>
            {payError && (
              <p role="alert" className="text-sm text-destructive">
                {payError}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPaying(null)}>
                {tc('cancel')}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? tc('saving') : t('paidConfirm')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* remove */}
      <Dialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent className="sm:max-w-[420px] [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>{t('removeTitle')}</DialogTitle>
            <DialogDescription>
              {removing && <bdi>{t('removeHint', { number: removing.number })}</bdi>}
            </DialogDescription>
          </DialogHeader>
          {removeError && (
            <p role="alert" className="text-sm text-destructive">
              {removeError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemoving(null)}>
              {t('removeKeep')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void confirmRemove()}
            >
              {t('removeConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
