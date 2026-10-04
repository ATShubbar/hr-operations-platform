'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import type {
  ClientListResponse,
  ClientResponse,
  EmployeeListResponse,
  EmployeeResponse,
} from '@hr/contracts';
import { formatHijri } from '@hr/dates';
import { matchesAnyField } from '@hr/text';
import { Link, useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { NATIONALITIES } from '@/lib/nationality';
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
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadError, NoAccess } from '@/components/ui/load-state';
import { Skeleton } from '@/components/ui/skeleton';
import { toastSuccess } from '@/components/ui/toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// People (DS-05) — the prototype's People screen, laid out as the owner's design
// has it (ADR-012): every employee judged by the document that expires FIRST,
// sorted soonest-first, with a client / document / time-left filter row and a
// coloured "days left" chip.
//
// The expiry dates come from the employee record itself (no API change): iqama,
// work permit and passport from government data, the contract from its end
// date. The prototype's two other document types — medical insurance and driving
// licence — are not stored yet, so they are SHOWN in the document filter, marked
// "soon" and disabled (owner rule: unbuilt parts are visible, never faked).
//
// One deliberate deviation, raised on the card: the prototype drops anyone with
// no dated document from the list. Here, with no document filter set, such a
// person stays — last, with "—" — because hiding a real employee (a Saudi on an
// open-ended contract, say) from the People screen would be a silent loss.

type DocKey = 'iqama' | 'permit' | 'contract' | 'passport' | 'insurance' | 'licence';

const DOC_TYPES: ReadonlyArray<{ key: DocKey; date?: (e: EmployeeResponse) => string | null }> = [
  { key: 'iqama', date: (e) => e.govdata?.iqamaExpiry ?? null },
  { key: 'permit', date: (e) => e.govdata?.workPermitExpiry ?? null },
  { key: 'contract', date: (e) => e.contractEndDate },
  { key: 'passport', date: (e) => e.govdata?.passportExpiry ?? null },
  { key: 'insurance' }, // not stored yet
  { key: 'licence' }, // not stored yet
];

const BANDS = ['0-7', '8-14', '15-30', '31-60', '61-90'] as const;
const PAGE = 50;
const ALL = 'all';
// The prototype's nationality list, as the ISO codes the API stores.

// The prototype's 6-column grid (2.2fr 1.5fr 1.4fr 1.3fr 1.5fr 40px), as table
// columns so the list keeps real table semantics. A <col> ignores calc(), so the
// five flexible columns take their share of 96% and the browser spreads the
// remainder proportionally — measured exact at 984px (263/179/167/155/179/40).
const FR = [2.2, 1.5, 1.4, 1.3, 1.5];
const FR_TOTAL = FR.reduce((a, b) => a + b, 0);

interface DocDue {
  key: DocKey;
  iso: string;
  days: number;
}

// Whole days from today (UTC) to a stored date. Storage is Gregorian UTC.
function daysTo(iso: string): number {
  const target = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}

const isSaudi = (e: EmployeeResponse) => e.nationality.toUpperCase() === 'SA';

function datedDocs(e: EmployeeResponse): DocDue[] {
  const out: DocDue[] = [];
  for (const d of DOC_TYPES) {
    // A Saudi has no iqama or work permit (the National ID does not expire).
    if (isSaudi(e) && (d.key === 'iqama' || d.key === 'permit')) continue;
    const iso = d.date?.(e);
    if (iso) out.push({ key: d.key, iso, days: daysTo(iso) });
  }
  return out;
}

// The prototype's chip scale: overdue or ≤7d red, ≤14d amber, ≤30d grey, later
// faded. Colour is never alone — the chip always carries its day count.
function chipClass(days: number): string {
  if (days <= 7) return 'bg-status-critical-surface text-status-critical';
  if (days <= 14) return 'bg-status-warning-surface text-status-warning';
  if (days <= 30) return 'bg-neutral-100 text-neutral-700';
  return 'bg-transparent text-neutral-400';
}

export default function PeoplePage() {
  const t = useTranslations('people');
  const ts = useTranslations('states');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const canCreate = useCan('employee.create');

  const [employees, setEmployees] = useState<EmployeeResponse[]>([]);
  const [clients, setClients] = useState<ClientResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const [search, setSearch] = useState('');
  const [fClient, setFClient] = useState(ALL);
  const [fDoc, setFDoc] = useState<DocKey | typeof ALL>(ALL);
  const [fBand, setFBand] = useState<(typeof BANDS)[number] | typeof ALL>(ALL);
  const [page, setPage] = useState(0);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [emp, cli] = await Promise.all([
        apiFetch<EmployeeListResponse>('/employees'),
        apiFetch<ClientListResponse>('/clients').catch(() => ({ clients: [] })),
      ]);
      setEmployees(emp.employees);
      setClients(cli.clients);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setError(t('error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const clientName = (id: string) => {
    const c = clients.find((x) => x.id === id);
    return c ? (locale === 'ar' ? c.name.ar : c.name.en) : id.slice(0, 8);
  };
  const regionNames = useMemo(() => new Intl.DisplayNames([locale], { type: 'region' }), [locale]);
  const nationalityName = (code: string) => {
    try {
      return regionNames.of(code.toUpperCase()) ?? code;
    } catch {
      return code;
    }
  };
  const name = (e: EmployeeResponse) => (locale === 'ar' ? e.name.ar : e.name.en);
  const position = (e: EmployeeResponse) =>
    (locale === 'ar' ? e.jobTitle.ar : e.jobTitle.en) ?? e.jobTitle.en ?? e.jobTitle.ar ?? '—';
  // The prototype's "11 Aug 2026": day, three-letter month, year. (en-GB would
  // print "Sept".) Arabic uses its own month names in the same order.
  const shortDate = (iso: string) => {
    const d = new Date(iso);
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
  const docLabel = (k: DocKey) => t(`doc.${k}`);

  // The document a row is judged on: the filtered type, or whichever expires first.
  const focusDoc = (e: EmployeeResponse): DocDue | null => {
    const docs = datedDocs(e);
    if (fDoc !== ALL) return docs.find((d) => d.key === fDoc) ?? null;
    return docs.sort((a, b) => a.days - b.days)[0] ?? null;
  };
  const inBand = (days: number) => {
    if (fBand === ALL) return true;
    const [lo, hi] = fBand.split('-').map(Number) as [number, number];
    return days >= lo && days <= hi;
  };

  const rows = useMemo(() => {
    const narrowing = fDoc !== ALL || fBand !== ALL;
    return (
      employees
        .filter((e) => fClient === ALL || e.clientId === fClient)
        .filter((e) =>
          matchesAnyField(
            [
              e.name.en,
              e.name.ar,
              e.jobTitle.en,
              e.jobTitle.ar,
              clientName(e.clientId),
              nationalityName(e.nationality),
              e.nationality,
            ],
            search,
          ),
        )
        .map((e) => ({ e, doc: focusDoc(e) }))
        // A document or time-left filter keeps only people it applies to (the
        // prototype's rule); with neither set, nobody is dropped.
        .filter(({ doc }) => (narrowing ? doc !== null && inBand(doc.days) : true))
        .sort((a, b) => {
          if (a.doc && b.doc) return a.doc.days - b.doc.days;
          if (a.doc) return -1;
          if (b.doc) return 1;
          return name(a.e).localeCompare(name(b.e), locale);
        })
    );
    // focusDoc/inBand/name read the filter state listed here.
  }, [employees, clients, search, fClient, fDoc, fBand, locale]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE, current * PAGE + PAGE);
  const filtered = fClient !== ALL || fDoc !== ALL || fBand !== ALL;

  const summary = (() => {
    const count = t('summaryCount', { count: rows.length });
    const doc = fDoc === ALL ? '' : ` · ${docLabel(fDoc)}`;
    const band =
      fBand === ALL ? '' : ` ${t('summaryBand', { range: fBand.replace('-', '\u2013') })}`;
    return doc || band ? `${count}${doc}${band}` : `${count} · ${t('summarySorted')}`;
  })();

  const clearFilters = () => {
    setFClient(ALL);
    setFDoc(ALL);
    setFBand(ALL);
    setSearch('');
    setPage(0);
  };

  // ---- Add person ----
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', ar: '', role: '', client: '', nat: 'IN' });
  const [addError, setAddError] = useState('');
  const [saving, setSaving] = useState(false);
  const activeClients = clients.filter((c) => c.status === 'active');

  const openAdd = () => {
    setAddError('');
    setForm((f) => ({ ...f, client: f.client || activeClients[0]?.id || '' }));
    setAddOpen(true);
  };

  async function submitAdd(ev: FormEvent) {
    ev.preventDefault();
    if (!form.name.trim()) return setAddError(t('add.errName'));
    // The API stores names in both scripts (bilingual fields, architecture.md);
    // the prototype leaves Arabic optional, the contract does not.
    if (!form.ar.trim()) return setAddError(t('add.errNameAr'));
    if (!form.role.trim()) return setAddError(t('add.errPosition'));
    if (!form.client) return setAddError(t('add.errClient'));
    setSaving(true);
    setAddError('');
    try {
      const created = await apiFetch<EmployeeResponse>('/employees', {
        method: 'POST',
        body: JSON.stringify({
          clientId: form.client,
          name: { en: form.name.trim(), ar: form.ar.trim() },
          nationality: form.nat,
          contractType: 'unlimited',
          // The position is typed in the interface language.
          ...(locale === 'ar'
            ? { jobTitleAr: form.role.trim() }
            : { jobTitleEn: form.role.trim() }),
        }),
      });
      setAddOpen(false);
      setForm((f) => ({ ...f, name: '', ar: '', role: '' }));
      // As the prototype does: land on the new person's company, filters cleared.
      setFClient(form.client);
      setFDoc(ALL);
      setFBand(ALL);
      setSearch('');
      setPage(0);
      await load();
      toastSuccess(t('add.added', { name: name(created), client: clientName(form.client) }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setAddError(t('add.saveError'));
    } finally {
      setSaving(false);
    }
  }

  const header = (
    // The prototype's row (title left, actions right, bottom-aligned) from sm up;
    // on a phone the actions drop below the title instead of squeezing it.
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
      <div className="flex min-w-0 grow flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{loading ? ' ' : summary}</p>
      </div>
      <span className="flex shrink-0 gap-2">
        {/* No register export exists yet — shown, disabled, and saying so. */}
        <Button variant="outline" size="sm" disabled aria-describedby="export-soon">
          {t('exportRegister')}
          <span id="export-soon" className="text-[11px] font-normal text-muted-foreground">
            {ts('soon')}
          </span>
        </Button>
        {canCreate && (
          <Button size="sm" onClick={openAdd}>
            {t('addPerson')}
          </Button>
        )}
      </span>
    </div>
  );

  if (forbidden) {
    return (
      <div className="flex max-w-[1240px] flex-col gap-4">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <NoAccess capability="employee.read" />
      </div>
    );
  }

  return (
    <div className="flex max-w-[1240px] flex-col gap-4">
      {header}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="h-7 w-[280px] max-w-full text-sm"
        />
        <Select
          value={fClient}
          onValueChange={(v) => {
            setFClient(v ?? ALL);
            setPage(0);
          }}
        >
          <SelectTrigger size="sm" className="w-[200px]" aria-label={t('filterClient')}>
            <SelectValue>
              {(v) => (v === ALL ? t('allClients') : clientName(String(v)))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('allClients')}</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {locale === 'ar' ? c.name.ar : c.name.en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={fDoc}
          onValueChange={(v) => {
            setFDoc((v as DocKey) ?? ALL);
            setPage(0);
          }}
        >
          <SelectTrigger size="sm" className="w-[200px]" aria-label={t('filterDocument')}>
            <SelectValue>
              {(v) => (v === ALL ? t('anyDocument') : docLabel(v as DocKey))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('anyDocument')}</SelectItem>
            {DOC_TYPES.map((d) => (
              <SelectItem key={d.key} value={d.key} disabled={!d.date}>
                {d.date ? docLabel(d.key) : t('docSoon', { doc: docLabel(d.key) })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={fBand}
          onValueChange={(v) => {
            setFBand((v as typeof fBand) ?? ALL);
            setPage(0);
          }}
        >
          <SelectTrigger size="sm" className="w-[200px]" aria-label={t('filterTimeLeft')}>
            <SelectValue>{(v) => (v === ALL ? t('anyTime') : t(`band.${String(v)}`))}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('anyTime')}</SelectItem>
            {BANDS.map((b) => (
              <SelectItem key={b} value={b}>
                {t(`band.${b}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="shrink-0">
            {t('clearFilters')}
          </Button>
        )}
      </div>

      {error && (
        <LoadError message={error} onRetry={() => void load()} hasContent={employees.length > 0} />
      )}

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        {/* Scrolls sideways on a phone, and is a keyboard stop so that scroll is
            reachable (UX-11). */}
        <div
          role="region"
          aria-label={t('title')}
          tabIndex={0}
          className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <table className="w-full min-w-[860px] table-fixed border-separate border-spacing-0">
            <colgroup>
              {FR.map((fr, i) => (
                <col key={i} style={{ width: `${((fr / FR_TOTAL) * 96).toFixed(3)}%` }} />
              ))}
              <col style={{ width: 40 }} />
            </colgroup>
            <thead>
              <tr className="bg-neutral-100 text-start text-xs leading-4 font-medium text-muted-foreground">
                <th className="px-4 py-2 text-start font-medium">{t('colEmployee')}</th>
                <th className="px-4 py-2 text-start font-medium">{t('colClient')}</th>
                <th className="px-4 py-2 text-start font-medium">{t('colPosition')}</th>
                <th className="px-4 py-2 text-start font-medium">{t('colIqama')}</th>
                <th className="px-4 py-2 text-start font-medium">
                  {fDoc === ALL ? t('colFirstDue') : t('colDocExpiry', { doc: docLabel(fDoc) })}
                </th>
                <th aria-hidden />
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 8 }, (_, i) => (
                  <tr key={i} className="h-14 [&>td]:border-t">
                    <td colSpan={6} className="px-4">
                      <Skeleton className="h-4 w-1/2" />
                    </td>
                  </tr>
                ))}
              {!loading &&
                visible.map(({ e, doc }) => {
                  const href = `/employees/${e.id}`;
                  const iqama = e.govdata?.iqamaExpiry ?? null;
                  return (
                    // The row is a mouse target as in the prototype; the NAME is
                    // the real link, so keyboard and screen-reader users reach the
                    // same place without a focus stop per cell.
                    <tr
                      key={e.id}
                      onClick={() => router.push(href)}
                      className="h-14 cursor-pointer transition-colors hover:bg-muted/40 [&>td]:border-t"
                    >
                      <td className="px-4">
                        <span className="flex items-center gap-2.5">
                          <Avatar name={e.name.en} size="sm" />
                          <span className="flex min-w-0 flex-col">
                            <Link
                              href={href}
                              onClick={(ev) => ev.stopPropagation()}
                              className="truncate text-sm leading-[19px] font-medium outline-none hover:underline focus-visible:underline"
                            >
                              {e.name.en}
                            </Link>
                            <span
                              dir="rtl"
                              // The prototype: direction rtl, aligned LEFT — in an
                              // rtl box that is the END edge.
                              className="text-end text-xs leading-4 text-muted-foreground"
                            >
                              {e.name.ar}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="truncate px-4 text-[13px] leading-[18px] text-neutral-700">
                        {clientName(e.clientId)}
                      </td>
                      <td className="px-4">
                        <span className="flex flex-col">
                          <span className="truncate text-[13px] leading-[18px]">{position(e)}</span>
                          <span className="truncate text-[11px] leading-[15px] text-muted-foreground">
                            {nationalityName(e.nationality)}
                          </span>
                        </span>
                      </td>
                      <td className="px-4">
                        {isSaudi(e) || !iqama ? (
                          <span className="text-[13px] leading-[18px] text-neutral-400">
                            {isSaudi(e) ? t('noExpiry') : '—'}
                          </span>
                        ) : (
                          <span className="flex flex-col">
                            <span className="text-[13px] leading-[18px]">{shortDate(iqama)}</span>
                            <span className="text-[10px] leading-[14px] text-neutral-400">
                              {formatHijri(new Date(iqama), locale)}
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="px-4">
                        {doc ? (
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className={cn(
                                'inline-flex h-5 shrink-0 items-center rounded-full px-2 font-mono text-[11px] leading-5 whitespace-nowrap',
                                chipClass(doc.days),
                              )}
                            >
                              {doc.days < 0
                                ? t('over', { n: Math.abs(doc.days) })
                                : t('left', { n: doc.days })}
                            </span>
                            <span className="truncate text-xs leading-4 text-muted-foreground">
                              {docLabel(doc.key)}
                            </span>
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] text-neutral-400">—</span>
                        )}
                      </td>
                      <td aria-hidden className="text-neutral-400">
                        <span className="flex justify-center">
                          <ChevronRight className="size-4" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {!loading && rows.length === 0 && (
          <div className="border-t p-6">
            <EmptyState
              variant={employees.length === 0 ? 'first-run' : 'no-results'}
              title={employees.length === 0 ? t('empty') : t('noResults')}
              action={
                employees.length > 0 && filtered ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    {t('clearFilters')}
                  </Button>
                ) : undefined
              }
            />
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center gap-3 border-t bg-neutral-50 px-4 py-2.5 text-xs leading-4 text-muted-foreground">
            <span className="grow">
              {t('range', {
                from: current * PAGE + 1,
                to: Math.min(rows.length, current * PAGE + PAGE),
                total: rows.length,
              })}
            </span>
            <span>{t('page', { page: current + 1, pages })}</span>
            <span className="flex shrink-0 gap-1.5">
              <Button
                variant="outline"
                size="xs"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
              >
                {t('previous')}
              </Button>
              <Button
                variant="outline"
                size="xs"
                disabled={current >= pages - 1}
                onClick={() => setPage(current + 1)}
              >
                {t('next')}
              </Button>
            </span>
          </div>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle>{t('add.title')}</DialogTitle>
            <DialogDescription>{t('add.description')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitAdd} className="flex flex-col gap-3.5" noValidate>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ap-name">{t('add.fullName')}</Label>
                <Input
                  id="ap-name"
                  dir="ltr"
                  className="text-start"
                  placeholder={t('add.fullNamePlaceholder')}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ap-ar">{t('add.nameAr')}</Label>
                <Input
                  id="ap-ar"
                  dir="rtl"
                  placeholder={t('add.nameArPlaceholder')}
                  value={form.ar}
                  onChange={(e) => setForm({ ...form, ar: e.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ap-role">{t('add.position')}</Label>
              <Input
                id="ap-role"
                placeholder={t('add.positionPlaceholder')}
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                aria-invalid={addError ? true : undefined}
                aria-describedby={addError ? 'ap-error' : undefined}
              />
            </div>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ap-client">{t('add.client')}</Label>
                <Select
                  value={form.client}
                  onValueChange={(v) => setForm({ ...form, client: v ?? '' })}
                >
                  <SelectTrigger id="ap-client" className="w-full">
                    <SelectValue>{(v) => (v ? clientName(String(v)) : '')}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {activeClients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {locale === 'ar' ? c.name.ar : c.name.en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ap-nat">{t('add.nationality')}</Label>
                <Select
                  value={form.nat}
                  onValueChange={(v) => setForm({ ...form, nat: v ?? 'IN' })}
                >
                  <SelectTrigger id="ap-nat" className="w-full">
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
              </div>
            </div>
            <p className="text-xs leading-4 text-pretty text-muted-foreground">{t('add.hint')}</p>
            {addError && (
              <p id="ap-error" role="alert" className="text-sm text-destructive">
                {addError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                {t('add.cancel')}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? t('add.saving') : t('add.submit')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
