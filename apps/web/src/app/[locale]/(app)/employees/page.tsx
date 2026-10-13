'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  ClientListResponse,
  ClientResponse,
  DependantExpiry,
  EmployeeListResponse,
  EmployeeResponse,
} from '@hr/contracts';
import { matchesAnyField } from '@hr/text';
import { Link, useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { NATIONALITIES } from '@/lib/nationality';
import {
  DOC_TYPES,
  chipClass,
  datedDocs,
  isSaudi,
  type DocDue,
  type DocKey,
} from '@/lib/employee-docs';
import {
  DEPENDANT_DOC_KEYS,
  dependantDocs,
  loadDependantExpiries,
  type DependantDocKey,
} from '@/lib/dependant-docs';
import type { Locale } from '@/lib/employee-format';
import { toneFor } from '@/lib/status-tone';
import { cn } from '@/lib/utils';
import { DepartmentPill } from '@/components/department-pill';
import { JobTitle } from '@/components/job-title';
import { StatusPill } from '@/components/ui/status-pill';
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
import { dateFormat, hijriDate } from '@/lib/dates';
import { dots } from '@/lib/pieces';
import { ExportRegisterButton } from '@/components/export-register-button';

// People — every employee judged by the document that expires FIRST, with a
// client / document / time-left filter row and a coloured "days left" chip
// (DS-05, from the prototype).
//
// PEOPLE-01 (ADR-012 rev. 1, owner decisions) changed the list itself: it is one
// sheet in the app's own theme, with the department (a soft-coloured pill — the
// one coloured thing in the theme), a two-tone job title and the employment
// status on each row; a SWITCH between people grouped under their company and
// one flat list (in which the company is a column); and a choice of order.
//
// The expiry dates come from the employee record itself: iqama, work permit,
// passport, medical insurance and driving licence from government data, the
// contract from its end date (the last two documents since INS-01).
//
// One deliberate deviation, raised on the card: the prototype drops anyone with
// no dated document from the list. Here, with no document filter set, such a
// person stays — last, with "—" — because hiding a real employee (a Saudi on an
// open-ended contract, say) from the People screen would be a silent loss.

const BANDS = ['overdue', '0-7', '8-14', '15-30', '31-60', '61-90'] as const;

// DEP-05b: the Document filter also offers the three DEPENDANT documents. Such a
// filter lists the SPONSORS — the employees whose dependants hold a matching
// document — because the list is of employees and a dependant is reached
// through their sponsor's record.
type DepFilter = `dep-${DependantDocKey}`;
type DocFilter = DocKey | DepFilter;
const DEP_FILTERS = DEPENDANT_DOC_KEYS.map((k) => `dep-${k}` as DepFilter);
const depKeyOf = (f: string): DependantDocKey | null =>
  (DEP_FILTERS as readonly string[]).includes(f) ? (f.slice(4) as DependantDocKey) : null;

/** What a row is judged on: how long is left, on which document (and for how many dependants). */
interface Focus {
  days: number;
  label: string;
}
const PAGE = 50;
const ALL = 'all';

// PEOPLE-01: how the list is ordered, and how it is arranged.
const SORTS = ['doc', 'name', 'newest'] as const;
type SortKey = (typeof SORTS)[number];
// Remembered on this device: a convenience, never something the page depends on.
const ARRANGE_KEY = 'people.arrange';

// The sheet's columns from `lg` up; below it a person is a stacked block, so the
// list never scrolls sideways on a phone. Grouped: the company is the heading.
// One list: the company is a column.
const GROUPED_COLS =
  'lg:grid lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,0.9fr)] lg:items-center lg:gap-4';
const FLAT_COLS =
  'lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,0.8fr)] lg:items-center lg:gap-3';

export default function PeoplePage() {
  const t = useTranslations('people');
  const te = useTranslations('employees');
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
  const [fDoc, setFDoc] = useState<DocFilter | typeof ALL>(ALL);
  // Dependants' expiry dates (DEP-05a); null = could not be read, so the three
  // dependant filters are not offered.
  const [dependants, setDependants] = useState<DependantExpiry[] | null>(null);
  const [fBand, setFBand] = useState<(typeof BANDS)[number] | typeof ALL>(ALL);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortKey>('doc');
  // Grouped under each company, or one list. Opens grouped; the last choice is
  // remembered on this device (read after mount, so the server and the first
  // paint agree).
  const [grouped, setGrouped] = useState(true);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(ARRANGE_KEY) === 'flat') setGrouped(false);
    } catch {
      // No storage (a private window): the page opens grouped.
    }
  }, []);
  const arrange = (value: boolean) => {
    setGrouped(value);
    setPage(0);
    try {
      window.localStorage.setItem(ARRANGE_KEY, value ? 'grouped' : 'flat');
    } catch {
      // Not remembered; nothing else depends on it.
    }
  };

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [emp, cli, deps] = await Promise.all([
        apiFetch<EmployeeListResponse>('/employees'),
        apiFetch<ClientListResponse>('/clients').catch(() => ({ clients: [] })),
        loadDependantExpiries(),
      ]);
      setEmployees(emp.employees);
      setClients(cli.clients);
      setDependants(deps);
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
    // `?client=<id>` arrives from a Client record's "View register" (DS-10);
    // `?doc=` and `?band=` from an Overview runway cell (DS-17). Read from
    // window.location, not useSearchParams, which would need a Suspense boundary
    // on this prerendered page. Unknown values are ignored.
    const q = new URLSearchParams(window.location.search);
    const c = q.get('client');
    if (c) setFClient(c);
    const d = q.get('doc');
    if (d && (DOC_TYPES.some((x) => x.key === d) || depKeyOf(d))) setFDoc(d as DocFilter);
    const b = q.get('band');
    if (b && (BANDS as readonly string[]).includes(b)) setFBand(b as (typeof BANDS)[number]);
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
      return dateFormat('ar', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(d);
    }
    const month = dateFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(d);
    return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
  };
  const docLabel = (k: DocFilter) => {
    const dep = depKeyOf(k);
    return dep ? t(`depDoc.${dep}`) : t(`doc.${k as DocKey}`);
  };
  const inBand = (days: number) => {
    if (fBand === ALL) return true;
    if (fBand === 'overdue') return days < 0;
    const [lo, hi] = fBand.split('-').map(Number) as [number, number];
    return days >= lo && days <= hi;
  };

  // The document a row is judged on: the filtered type, or whichever of the
  // person's OWN documents expires first.
  const focusDoc = (e: EmployeeResponse): Focus | null => {
    const dep = fDoc === ALL ? null : depKeyOf(fDoc);
    if (dep) {
      // A sponsor may have several dependants holding this document: judge the
      // row on the soonest one the time-left filter keeps, and say how many.
      const matching = dependantDocs(dependants ?? [], [e])
        .filter((d) => d.key === dep && inBand(d.days))
        .sort((a, b) => a.days - b.days);
      const first = matching[0];
      if (!first) return null;
      const doc = t(`depDoc.${dep}`);
      return {
        days: first.days,
        label: matching.length > 1 ? t('depMany', { doc, count: matching.length }) : doc,
      };
    }
    const docs = datedDocs(e);
    const own: DocDue | undefined =
      fDoc !== ALL ? docs.find((d) => d.key === fDoc) : docs.sort((a, b) => a.days - b.days)[0];
    return own ? { days: own.days, label: t(`doc.${own.key}`) } : null;
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
          // Grouped: a company's people stay together, companies by name — so a
          // company continues across a page break rather than being scattered.
          if (grouped && a.e.clientId !== b.e.clientId) {
            return clientName(a.e.clientId).localeCompare(clientName(b.e.clientId), locale);
          }
          if (sort === 'name') return name(a.e).localeCompare(name(b.e), locale);
          if (sort === 'newest') {
            const newest = (b.e.hireDate ?? '').localeCompare(a.e.hireDate ?? '');
            if (newest !== 0) return newest;
          } else {
            // The document that expires first; people with none come last.
            if (a.doc && b.doc && a.doc.days !== b.doc.days) return a.doc.days - b.doc.days;
            if (a.doc && !b.doc) return -1;
            if (b.doc && !a.doc) return 1;
          }
          return name(a.e).localeCompare(name(b.e), locale);
        })
    );
    // focusDoc/inBand/name read the filter state listed here.
  }, [employees, clients, dependants, search, fClient, fDoc, fBand, locale, sort, grouped]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE, current * PAGE + PAGE);
  // The page's people under their company headings — or all under one, unnamed.
  const groups = (() => {
    if (!grouped) return [{ id: 'everyone', name: '', people: visible }];
    const out: { id: string; name: string; people: typeof visible }[] = [];
    for (const row of visible) {
      const last = out[out.length - 1];
      if (last && last.id === row.e.clientId) last.people.push(row);
      else out.push({ id: row.e.clientId, name: clientName(row.e.clientId), people: [row] });
    }
    return out;
  })();
  // How many of each company the FILTERS keep — a heading shows the whole
  // company's count, not only the part of it on this page.
  const perCompany = new Map<string, number>();
  for (const r of rows) perCompany.set(r.e.clientId, (perCompany.get(r.e.clientId) ?? 0) + 1);
  const COLS = grouped ? GROUPED_COLS : FLAT_COLS;
  const filtered = fClient !== ALL || fDoc !== ALL || fBand !== ALL;
  // The export sends the rows on screen only when something narrows them.
  const narrowed = filtered || search.trim() !== '';

  const summary = (() => {
    const count = t('summaryCount', { count: rows.length });
    const doc = fDoc === ALL ? null : docLabel(fDoc);
    const band =
      fBand === ALL
        ? null
        : fBand === 'overdue'
          ? t('summaryOverdue')
          : // Two slots, not one "8–14" value: a range passed as a single value is
            // drawn left to right inside an Arabic sentence (UX-20).
            t('summaryBand', { from: fBand.split('-')[0] ?? '', to: fBand.split('-')[1] ?? '' });
    if (!doc && !band) return dots(locale, count, t(`sorted.${sort}`));
    // "3 people expiring in 8–14 days": the band continues the count's sentence.
    if (!doc) return `${count} ${band}`;
    return dots(locale, count, band ? `${doc} ${band}` : doc);
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
        {/* What is on screen: with a filter or a search, exactly those people in
            that order; with neither, everyone (no list is sent). */}
        <ExportRegisterButton
          path="/employees/export"
          label={t('exportRegister')}
          ids={narrowed ? rows.map((r) => r.e.id) : undefined}
          disabled={loading}
        />
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
            setFDoc((v as DocFilter) ?? ALL);
            setPage(0);
          }}
        >
          <SelectTrigger size="sm" className="w-[200px]" aria-label={t('filterDocument')}>
            <SelectValue>
              {(v) => (v === ALL ? t('anyDocument') : docLabel(v as DocFilter))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('anyDocument')}</SelectItem>
            {DOC_TYPES.map((d) => (
              <SelectItem key={d.key} value={d.key}>
                {docLabel(d.key)}
              </SelectItem>
            ))}
            {/* Dependants' documents list their sponsors (DEP-05b). Not offered
                when the dates could not be read. */}
            {DEP_FILTERS.map((k) => (
              <SelectItem key={k} value={k} disabled={dependants === null}>
                {docLabel(k)}
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
        <Select
          value={sort}
          onValueChange={(v) => {
            setSort((v as SortKey) ?? 'doc');
            setPage(0);
          }}
        >
          <SelectTrigger size="sm" className="w-[240px] max-w-full" aria-label={t('sortBy')}>
            <SelectValue>{(v) => t('sortValue', { by: t(`sort.${String(v)}`) })}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((key) => (
              <SelectItem key={key} value={key}>
                {t(`sort.${key}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Grouped under each company, or one list across all of them. */}
        <div
          role="group"
          aria-label={t('arrange.label')}
          className="ms-auto inline-flex h-7 items-center rounded-lg bg-muted p-0.5"
        >
          {([true, false] as const).map((value) => (
            <button
              key={String(value)}
              type="button"
              aria-pressed={grouped === value}
              onClick={() => arrange(value)}
              className={cn(
                'h-6 rounded-md px-2.5 text-xs leading-4 font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                grouped === value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {value ? t('arrange.grouped') : t('arrange.flat')}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <LoadError message={error} onRetry={() => void load()} hasContent={employees.length > 0} />
      )}

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div
          className={cn(
            'hidden bg-neutral-100 px-4 py-2 text-xs leading-4 font-medium text-muted-foreground',
            COLS,
          )}
        >
          <span>{t('colEmployee')}</span>
          {!grouped && <span>{t('colClient')}</span>}
          <span>{t('colDepartment')}</span>
          <span>{t('colPosition')}</span>
          <span>{t('colIqama')}</span>
          <span>
            {fDoc === ALL ? t('colFirstDue') : t('colDocExpiry', { doc: docLabel(fDoc) })}
          </span>
          <span>{t('colStatus')}</span>
        </div>
        {loading &&
          Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex h-14 items-center border-t px-4">
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        {!loading &&
          groups.map((group) => (
            <section key={group.id} aria-label={group.name || t('title')}>
              {grouped && (
                <h2 className="flex items-center gap-2 border-t bg-neutral-50 px-4 py-1.5 text-xs leading-4 font-medium">
                  <span className="truncate">{group.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {perCompany.get(group.id) ?? group.people.length}
                  </span>
                </h2>
              )}
              <ul>
                {group.people.map(({ e, doc }) => {
                  // Under a dependant filter the row opens where the dependants are.
                  const href =
                    fDoc !== ALL && depKeyOf(fDoc)
                      ? `/employees/${e.id}?tab=family`
                      : `/employees/${e.id}`;
                  const iqama = e.govdata?.iqamaExpiry ?? null;
                  return (
                    <li key={e.id} className="border-t">
                      {/* The whole row is ONE link: one focus stop per person,
                          named by everything on the row. */}
                      <Link
                        href={href}
                        className={cn(
                          'flex min-h-14 flex-col gap-2 px-4 py-2.5 transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/60',
                          COLS,
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <Avatar name={e.name.en} size="sm" />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-sm leading-[19px] font-medium">
                              {name(e)}
                            </span>
                            <span className="truncate text-xs leading-4 text-muted-foreground">
                              {locale === 'ar' ? e.name.en : e.name.ar}
                            </span>
                          </span>
                        </span>
                        {!grouped && (
                          <span className="truncate text-[13px] leading-[18px] text-neutral-700">
                            {clientName(e.clientId)}
                          </span>
                        )}
                        <span className="min-w-0">
                          <DepartmentPill department={e.department} />
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <JobTitle
                            title={position(e)}
                            className="truncate text-[13px] leading-[18px]"
                          />
                          <span className="truncate text-[11px] leading-[15px] text-muted-foreground">
                            {nationalityName(e.nationality)}
                          </span>
                        </span>
                        <span className="flex min-w-0 flex-col">
                          {isSaudi(e) || !iqama ? (
                            <span className="text-[13px] leading-[18px] text-neutral-400">
                              {isSaudi(e) ? t('noExpiry') : '—'}
                            </span>
                          ) : (
                            <>
                              <span className="truncate text-[13px] leading-[18px]">
                                {shortDate(iqama)}
                              </span>
                              <span className="truncate text-[10px] leading-[14px] text-neutral-400">
                                {hijriDate(new Date(iqama), locale)}
                              </span>
                            </>
                          )}
                        </span>
                        <span className="flex min-w-0 items-center gap-2">
                          {doc ? (
                            <>
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
                                {doc.label}
                              </span>
                            </>
                          ) : (
                            <span className="font-mono text-[11px] text-neutral-400">—</span>
                          )}
                        </span>
                        <span>
                          <StatusPill tone={toneFor('employee', e.employmentStatus)}>
                            {te(`status.${e.employmentStatus}`)}
                          </StatusPill>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

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
