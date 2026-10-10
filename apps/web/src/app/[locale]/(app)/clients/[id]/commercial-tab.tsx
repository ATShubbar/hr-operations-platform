'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Lock, TriangleAlert } from 'lucide-react';
import type { BillingSummaryResponse, ClientResponse } from '@hr/contracts';
import { BILLING_CYCLES, type BillingCycle } from '@hr/contracts/billing-lists';
import { formatHijri } from '@hr/dates';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { halalasToInput, sarTextToHalalas, useMoney } from '@/lib/money';
import { useCan } from '@/lib/session';
import { toneFor } from '@/lib/status-tone';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SkeletonRegion } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { toastSuccess } from '@/components/ui/toast';
import { InvoicesCard } from './invoices-card';

// The Client record's Commercial tab, first half (BILL-04, ADR-020) — the
// prototype's Subscription and Agreement cards and what the tier includes.
//
// What is stored and what is worked out, because money invites misreading:
//   · the TERMS are recorded by an Administrator: a platform fee and a rate
//     per employee (both per month), the billing cycle, a purchase order and
//     the payment terms;
//   · everything else on the Subscription card is ARITHMETIC over those terms
//     and the people under management at this client today (the same headcount
//     the Overview and Reports use) — an estimate, not an invoice. The invoice
//     is issued from the accounting system, and no VAT is calculated here;
//   · the tier and the term dates come from the client's profile (ADR-019) and
//     are changed there, in the Service panel on Overview.
// BILL-05: the account standing (derived from the invoice records, never set)
// and the invoice records themselves (`invoices-card.tsx`). An overdue account
// shows the prototype's banner.
//
// A viewer without `billing.read` (HR and GRO officers) gets the prototype's
// locked state, and NO request is made for the figures.

const MAX_DAYS = 365;
const todayIso = () => new Date().toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

interface TermsForm {
  platform: string;
  seat: string;
  cycle: BillingCycle;
  po: string;
  days: string;
}

export function CommercialTab({ client }: { client: ClientResponse }) {
  const t = useTranslations('clients.commercial');
  const tc = useTranslations('clients');
  const tp = useTranslations('clientProfile');
  const ts = useTranslations('states');
  const locale = useLocale() as 'ar' | 'en';
  const router = useRouter();
  const money = useMoney();
  const canRead = useCan('billing.read');
  const canEdit = useCan('billing.update');

  const [data, setData] = useState<BillingSummaryResponse | null>(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      setData(await apiFetch<BillingSummaryResponse>(`/billing/clients/${client.id}`));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('loadError'));
    }
  }
  useEffect(() => {
    if (canRead) void load();
  }, [client.id, canRead]);

  // ---- edit terms ----
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  // Decided when the dialog opens, so its title does not flip from "Record" to
  // "Edit" while it is closing after a first save.
  const [firstTime, setFirstTime] = useState(true);
  const [form, setForm] = useState<TermsForm>({
    platform: '',
    seat: '',
    cycle: 'monthly',
    po: '',
    days: '30',
  });
  const set = (patch: Partial<TermsForm>) => (
    setFormError(''),
    setForm((f) => ({ ...f, ...patch }))
  );

  function startEdit() {
    const terms = data?.terms;
    setFormError('');
    setFirstTime(!terms);
    setForm({
      platform: terms ? halalasToInput(terms.platformFeeHalalas) || '0' : '',
      seat: terms ? halalasToInput(terms.seatRateHalalas) || '0' : '',
      cycle: terms?.cycle ?? 'monthly',
      po: terms?.poNumber ?? '',
      days: String(terms?.paymentTermsDays ?? 30),
    });
    setOpen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    // An empty amount is not zero here: terms are an agreement, and a blank
    // box saved as "SAR 0 a month" would be a figure nobody agreed.
    if (form.platform.trim() === '' || form.seat.trim() === '')
      return setFormError(t('error.amountMissing'));
    const platformFeeHalalas = sarTextToHalalas(form.platform);
    const seatRateHalalas = sarTextToHalalas(form.seat);
    if (platformFeeHalalas === null || seatRateHalalas === null)
      return setFormError(t('error.amount'));
    if (!/^\d{1,3}$/.test(form.days.trim()) || Number(form.days) > MAX_DAYS)
      return setFormError(t('error.days'));
    setBusy(true);
    setFormError('');
    try {
      const saved = await apiFetch<BillingSummaryResponse>(`/billing/clients/${client.id}/terms`, {
        method: 'PUT',
        body: JSON.stringify({
          platformFeeHalalas,
          seatRateHalalas,
          cycle: form.cycle,
          poNumber: form.po.trim() || null,
          paymentTermsDays: Number(form.days),
        }),
      });
      setData(saved);
      setOpen(false);
      toastSuccess(t('saved'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setFormError(
        err instanceof ApiError && err.status === 400 ? t('error.invalid') : t('error.save'),
      );
    } finally {
      setBusy(false);
    }
  }

  const card = 'rounded-xl bg-card ring-1 ring-foreground/10';
  // ADR-012 lays the page out left to right in both languages, so a whole
  // Arabic line is isolated: otherwise its full stop, or a figure it opens
  // with, lands at the wrong end.
  const whole = (text: string) => (
    <span>
      <bdi>{text}</bdi>
    </span>
  );

  if (!canRead) {
    return (
      <div className={cn(card, 'flex flex-col items-center gap-2.5 px-6 py-12')} role="status">
        <span className="inline-flex size-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
          <Lock className="size-[18px]" aria-hidden />
        </span>
        <h2 className="text-center text-base leading-6 font-medium">{t('locked.title')}</h2>
        <p className="max-w-[440px] text-center text-[13px] leading-[18px] text-pretty text-muted-foreground">
          {whole(t('locked.body'))}
        </p>
      </div>
    );
  }

  if (error && !data) return <LoadError message={error} onRetry={() => void load()} />;
  if (!data) return <SkeletonRegion label={ts('loading')} />;

  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
      numberingSystem: 'latn',
    }).format(new Date(`${iso}T00:00:00Z`));
  const hijri = (iso: string) => formatHijri(new Date(`${iso}T00:00:00Z`), locale);

  const { terms, estimate, standing } = data;
  const s = client.service;
  const renewIn = s.termEnd ? daysBetween(todayIso(), s.termEnd) : null;
  const notRecorded = (
    <span className="text-[13px] leading-[18px] text-neutral-400">{tp('notRecorded')}</span>
  );

  // One line of the Subscription card: a label and a figure. Whole Arabic
  // lines are isolated so a Latin amount inside one stays where it was written.
  const line = (
    label: string,
    value: string,
    opts: { strong?: boolean; warn?: boolean; small?: boolean } = {},
  ) => (
    <div className="flex items-baseline gap-2">
      <dt
        className={cn(
          'min-w-0 grow',
          opts.strong
            ? 'text-[13px] leading-[18px] font-medium'
            : cn(
                'text-muted-foreground',
                opts.small ? 'text-xs leading-4' : 'text-[13px] leading-[18px]',
              ),
        )}
      >
        <span>
          <bdi>{label}</bdi>
        </span>
      </dt>
      <dd
        className={cn(
          'shrink-0 font-mono tabular-nums',
          opts.small ? 'text-xs' : 'text-[13px]',
          opts.small && !opts.warn && 'text-muted-foreground',
          opts.warn && 'text-status-warning',
        )}
      >
        <bdi>{value}</bdi>
      </dd>
    </div>
  );

  const fact = (label: string, value: ReactNode) => (
    <div className="flex items-baseline gap-2">
      <dt className="min-w-0 grow text-xs leading-4 text-muted-foreground">{label}</dt>
      <dd className="flex shrink-0 flex-col items-end text-[13px] leading-[18px]">{value}</dd>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {error && <LoadError message={error} onRetry={() => void load()} hasContent />}

      {standing.state === 'overdue' && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-lg bg-status-critical-surface px-4 py-3 text-status-critical"
        >
          <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden />
          <p className="text-[13px] leading-[18px] text-pretty">
            {whole(
              t('overdueBanner', {
                count: standing.overdueCount,
                overdue: money(standing.overdueHalalas),
                outstanding: money(standing.outstandingHalalas),
              }),
            )}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr]">
        <section
          aria-labelledby="cm-sub"
          className={cn(card, 'flex flex-col gap-3.5 px-5 py-[18px]')}
        >
          {/* The title shares its line with the tier and the button; the
              sentence gets the full width beneath, so it does not wrap into a
              narrow column on a phone. */}
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2.5">
              <h2 id="cm-sub" className="min-w-0 grow text-base leading-6 font-medium">
                {t('subscription')}
              </h2>
              {s.tier && (
                <Badge variant="secondary" className="shrink-0">
                  {tp(`tier.${s.tier}`)}
                </Badge>
              )}
              {canEdit && terms && (
                <Button variant="outline" size="xs" className="shrink-0" onClick={startEdit}>
                  {t('edit')}
                </Button>
              )}
            </div>
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              {whole(t('subscriptionSub'))}
            </p>
          </div>

          {terms && estimate ? (
            <dl className="flex flex-col gap-2 border-t pt-3">
              {line(t('platformFee'), money(estimate.platformFeeHalalas))}
              {line(
                t('seats', { count: estimate.headcount, rate: money(terms.seatRateHalalas) }),
                money(estimate.seatsHalalas),
              )}
              <div className="flex items-baseline gap-2 border-t pt-2">
                <dt className="min-w-0 grow text-sm leading-5 font-medium">{t('monthly')}</dt>
                <dd className="shrink-0 text-xl leading-[26px] font-semibold tracking-[-0.01em] tabular-nums">
                  <bdi>{money(estimate.monthlyHalalas)}</bdi>
                </dd>
              </div>
              {line(t(`billed.${terms.cycle}`), money(estimate.cycleHalalas), { small: true })}
              {line(t('annual'), money(estimate.annualHalalas), { small: true })}
              <div className="border-t pt-2">
                {line(t('unrecovered'), money(data.unrecoveredFeesHalalas), {
                  small: true,
                  warn: data.unrecoveredFeesHalalas > 0,
                })}
              </div>
              {line(t('nextInvoice'), money(estimate.nextInvoiceHalalas), { strong: true })}
            </dl>
          ) : (
            <div className="flex flex-col items-start gap-3 border-t pt-3">
              <p className="text-[13px] leading-[18px] text-muted-foreground">
                {whole(canEdit ? t('noTerms') : t('noTermsReadOnly'))}
              </p>
              <dl className="w-full">
                {line(t('unrecovered'), money(data.unrecoveredFeesHalalas), {
                  small: true,
                  warn: data.unrecoveredFeesHalalas > 0,
                })}
              </dl>
              {canEdit && (
                <Button size="sm" onClick={startEdit}>
                  {t('record')}
                </Button>
              )}
            </div>
          )}
          {estimate && (
            <p className="text-xs leading-4 text-neutral-500">{whole(t('estimateNote'))}</p>
          )}
        </section>

        <section
          aria-labelledby="cm-agr"
          className={cn(card, 'flex flex-col gap-3.5 px-5 py-[18px]')}
        >
          <h2 id="cm-agr" className="text-base leading-6 font-medium">
            {t('agreement')}
          </h2>
          <dl className="flex flex-col gap-2">
            {fact(t('termStart'), s.termStart ? whole(date(s.termStart)) : notRecorded)}
            {fact(
              t('termEnd'),
              s.termEnd ? (
                <>
                  {whole(date(s.termEnd))}
                  <span className="text-[10px] leading-[14px] text-neutral-400">
                    <bdi>{hijri(s.termEnd)}</bdi>
                  </span>
                </>
              ) : (
                notRecorded
              ),
            )}
            {fact(
              t('renewal'),
              renewIn === null ? (
                notRecorded
              ) : (
                <span
                  className={cn(renewIn < 60 ? 'text-status-warning' : 'text-muted-foreground')}
                >
                  <bdi>{renewIn > 0 ? t('renewIn', { count: renewIn }) : t('termEnded')}</bdi>
                </span>
              ),
            )}
            {fact(
              t('po'),
              terms?.poNumber ? (
                <span className="font-mono text-xs">
                  <bdi dir="ltr">{terms.poNumber}</bdi>
                </span>
              ) : (
                notRecorded
              ),
            )}
            {fact(
              t('paymentTerms'),
              terms ? whole(t('paymentDays', { count: terms.paymentTermsDays })) : notRecorded,
            )}
            <div className="flex items-center gap-2 border-t pt-2">
              <dt className="min-w-0 grow text-xs leading-4 text-muted-foreground">
                {t('standing')}
              </dt>
              <dd className="flex shrink-0 flex-col items-end gap-0.5">
                <StatusPill tone={toneFor('standing', standing.state)}>
                  {t(`standingState.${standing.state}`)}
                </StatusPill>
                {standing.outstandingHalalas > 0 && (
                  <span className="text-[11px] leading-[15px] text-muted-foreground">
                    {whole(t('outstanding', { amount: money(standing.outstandingHalalas) }))}
                  </span>
                )}
              </dd>
            </div>
          </dl>
          <p className="text-xs leading-4 text-neutral-500">{whole(t('agreementNote'))}</p>
          {data.termsUpdatedAt && (
            <p className="text-xs leading-4 text-neutral-500">
              <span>
                <bdi>
                  {data.termsUpdatedBy
                    ? t('updatedBy', {
                        name: data.termsUpdatedBy,
                        date: date(data.termsUpdatedAt.slice(0, 10)),
                      })
                    : t('updatedOn', { date: date(data.termsUpdatedAt.slice(0, 10)) })}
                </bdi>
              </span>
            </p>
          )}
        </section>
      </div>

      {/* The prototype sets the tier list beside the invoices. A record here
          carries more than its four columns (the due date, the fees it
          recovers, its actions), so the list takes the full width and the
          tier list follows it. */}
      <InvoicesCard
        clientId={client.id}
        paymentTermsDays={terms?.paymentTermsDays ?? null}
        onChanged={() => void load()}
      />

      <section aria-labelledby="cm-inc" className={cn(card, 'flex flex-col gap-3 px-5 py-[18px]')}>
        <h2 id="cm-inc" className="text-base leading-6 font-medium">
          {s.tier ? t('includes', { tier: tp(`tier.${s.tier}`) }) : t('includesNoTier')}
        </h2>
        {s.tier ? (
          <ul className="flex flex-col gap-2">
            {(t.raw(`tierIncludes.${s.tier}`) as string[]).map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-[13px] leading-[18px] text-pretty"
              >
                <Check className="mt-0.5 size-3.5 shrink-0 text-status-ok" aria-hidden />
                <span>
                  <bdi>{item}</bdi>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] leading-[18px] text-muted-foreground">{whole(t('noTier'))}</p>
        )}
        <p className="text-xs leading-4 text-neutral-500">{whole(t('includesNote'))}</p>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[520px] [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>{firstTime ? t('recordTitle') : t('editTitle')}</DialogTitle>
            <DialogDescription>{t('formHint')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cm-platform">{t('form.platform')}</Label>
                <Input
                  id="cm-platform"
                  dir="ltr"
                  inputMode="decimal"
                  placeholder="3500"
                  value={form.platform}
                  onChange={(e) => set({ platform: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cm-seat">{t('form.seat')}</Label>
                <Input
                  id="cm-seat"
                  dir="ltr"
                  inputMode="decimal"
                  placeholder="65"
                  value={form.seat}
                  onChange={(e) => set({ seat: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cm-cycle">{t('form.cycle')}</Label>
                <Select
                  value={form.cycle}
                  onValueChange={(v) => v && set({ cycle: v as BillingCycle })}
                >
                  <SelectTrigger id="cm-cycle" className="w-full">
                    <SelectValue>{(v) => t(`cycle.${String(v)}`)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {BILLING_CYCLES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {t(`cycle.${c}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cm-days">{t('form.days')}</Label>
                <Input
                  id="cm-days"
                  dir="ltr"
                  inputMode="numeric"
                  value={form.days}
                  onChange={(e) => set({ days: e.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cm-po">{t('form.po')}</Label>
              <Input
                id="cm-po"
                dir="ltr"
                maxLength={60}
                value={form.po}
                onChange={(e) => set({ po: e.target.value })}
              />
            </div>
            <p className="text-xs leading-4 text-neutral-500">{t('form.tierNote')}</p>
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {tc('cancel')}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? tc('saving') : tc('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
