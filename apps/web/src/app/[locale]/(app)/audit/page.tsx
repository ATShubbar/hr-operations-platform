'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocale, useMessages, useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import type {
  AuditEntry,
  AuditListResponse,
  AuditSummaryResponse,
  StaffDirectoryEntry,
  StaffDirectoryResponse,
} from '@hr/contracts';
import { formatHijri } from '@hr/dates';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { toneFor } from '@/lib/status-tone';
import {
  AUDIT_CATEGORIES,
  CATEGORY_CLASS,
  categoryOf,
  resourcesOf,
  type AuditCategory,
} from '@/lib/audit-category';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadError, NoAccess } from '@/components/ui/load-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { EntryDialog } from './entry-dialog';

// The Audit trail (DS-15) — the prototype's screen (ADR-012) over the audit log
// (AUDIT-04), still Administrator + Auditor only (audit.read).
//
// Every filter runs on the SERVER, so it reaches every page of a log that is
// paged ("Load more"): text search (`q`), actor (`actorId`), category (a set of
// record types → `resources`, lib/audit-category.ts) and time window (`from`).
// Filtering only the rows already loaded would silently miss older entries —
// the reason UX-03c kept this screen off the client-side DataTable.
//
// The header's figures come from GET /audit/summary. AUDIT-07: every entry
// carries the SERVER's severity (routine / notable / critical — one table,
// modules/audit/domain/severity.ts), the severity filter runs server-side like
// the others, "Flagged critical" counts today's critical entries and opens them,
// and Export (audit.export — Administrator + Auditor) downloads EVERY entry the
// current filters match, not just the pages loaded, as CSV with full before/after
// values. The export is itself an audited, critical event.

const PAGE_SIZE = 50;
const ALL = 'all';
const WINDOWS = ['all', '0', '7', '30'] as const;
type Window = (typeof WINDOWS)[number];
const SEVERITIES = ['critical', 'notable', 'routine'] as const;
type Severity = (typeof SEVERITIES)[number];

/** Local midnight `days` ago, as an ISO instant. */
function startOfDayAgo(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}
const localDay = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** A readable name for the record, from whatever the snapshot carries. */
function nameIn(entry: AuditEntry): string | null {
  for (const s of [entry.after, entry.before]) {
    if (!s || typeof s !== 'object') continue;
    const o = s as Record<string, unknown>;
    const name = o.name as { en?: string } | string | undefined;
    const candidate =
      o.title ??
      o.nameEn ??
      (typeof name === 'object' ? name?.en : name) ??
      o.displayName ??
      o.email ??
      o.key;
    if (typeof candidate === 'string' && candidate) return candidate;
  }
  return null;
}

export default function AuditTrailPage() {
  const t = useTranslations('audit');
  const tr = useTranslations('roles');
  const messages = useMessages() as {
    audit?: {
      verb?: Record<string, string>;
      noun?: Record<string, string>;
      phrase?: Record<string, string>;
    };
    roles?: Record<string, string>;
  };
  const locale = useLocale() as 'ar' | 'en';
  const router = useRouter();

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [summary, setSummary] = useState<AuditSummaryResponse | null>(null);
  const [staff, setStaff] = useState<StaffDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [open, setOpen] = useState<AuditEntry | null>(null);

  const [search, setSearch] = useState('');
  const [q, setQ] = useState(''); // the debounced search actually sent
  const [actor, setActor] = useState(ALL);
  const [category, setCategory] = useState<AuditCategory | typeof ALL>(ALL);
  const [win, setWin] = useState<Window>('all');
  const [severity, setSeverity] = useState<Severity | typeof ALL>(ALL);
  const canExport = useCan('audit.export');
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState('');

  // Typing searches after a pause, not per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set('limit', String(PAGE_SIZE));
    if (q) p.set('q', q);
    if (actor !== ALL) p.set('actorId', actor);
    if (category !== ALL) p.set('resources', resourcesOf(category).join(','));
    if (win !== 'all') p.set('from', startOfDayAgo(Number(win)));
    if (severity !== ALL) p.set('severity', severity);
    return p;
  }, [q, actor, category, win, severity]);

  const fetchPage = useCallback(
    async (beforeId?: string) => {
      if (beforeId) setLoadingMore(true);
      else setLoading(true);
      setError('');
      try {
        const p = new URLSearchParams(params);
        if (beforeId) p.set('beforeId', beforeId);
        const res = await apiFetch<AuditListResponse>(`/audit?${p.toString()}`);
        setEntries((prev) => (beforeId ? [...prev, ...res.entries] : res.entries));
        setCursor(res.nextCursor);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
        if (err instanceof ApiError && err.status === 403) setForbidden(true);
        else setError(t('error'));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [params, router, t],
  );

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  useEffect(() => {
    apiFetch<AuditSummaryResponse>(`/audit/summary?from=${encodeURIComponent(startOfDayAgo(0))}`)
      .then(setSummary)
      .catch(() => setSummary(null));
    apiFetch<StaffDirectoryResponse>('/staff-users/directory')
      .then((r) => setStaff(r.users))
      .catch(() => setStaff([]));
  }, []);

  const filtered =
    q !== '' || actor !== ALL || category !== ALL || win !== 'all' || severity !== ALL;
  const reset = () => {
    setSearch('');
    setQ('');
    setActor(ALL);
    setCategory(ALL);
    setWin('all');
    setSeverity(ALL);
  };

  // The export is a file, not JSON — fetched directly so the CSV bytes (BOM and
  // all) reach the browser untouched. Same filters as the list, minus paging: the
  // server writes every matching entry, up to its cap, and says when it stopped.
  async function exportCsv() {
    setExporting(true);
    setExportNote('');
    try {
      const p = new URLSearchParams(params);
      p.delete('limit');
      const qs = p.toString();
      const res = await fetch(`/api/audit/export${qs ? `?${qs}` : ''}`, { credentials: 'include' });
      if (res.status === 401) return void router.replace('/login');
      if (!res.ok) throw new ApiError(res.status, 'export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `audit-trail-${localDay(new Date().toISOString())}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      const rows = Number(res.headers.get('X-Export-Rows') ?? 0);
      setExportNote(
        res.headers.get('X-Export-Truncated') === 'true'
          ? t('exportTruncated', { count: rows })
          : t('exportDone', { count: rows }),
      );
    } catch {
      setExportNote(t('exportError'));
    } finally {
      setExporting(false);
    }
  }
  const showCritical = () => {
    setSeverity('critical');
    setWin('0');
  };

  // ---- labels ----
  const known = (group: 'verb' | 'noun' | 'phrase', key: string) =>
    Boolean(messages.audit?.[group]?.[key]);
  // "Created a request": a verb for the action + a noun for the record type. A
  // few actions do not read that way (settings changes), so a whole phrase can
  // override the pair. Anything unknown shows its raw codes rather than nothing.
  const actionLabel = (e: AuditEntry) => {
    const phraseKey = `${e.resource}__${e.action}`;
    if (known('phrase', phraseKey)) return t(`phrase.${phraseKey}`);
    return known('verb', e.action) && known('noun', e.resource)
      ? t('actionPhrase', { verb: t(`verb.${e.action}`), noun: t(`noun.${e.resource}`) })
      : `${e.action} · ${e.resource}`;
  };
  const targetLabel = (e: AuditEntry) => {
    const noun = known('noun', e.resource) ? t(`noun.${e.resource}`) : e.resource;
    const name = nameIn(e);
    const ref = e.resourceId ? `#${e.resourceId.slice(0, 8)}` : null;
    return [name ?? noun, name ? null : ref].filter(Boolean).join(' ');
  };
  const actorName = (e: AuditEntry) => {
    if (!e.actorId) return t('system');
    return staff.find((s) => s.id === e.actorId)?.displayName ?? `#${e.actorId.slice(0, 8)}`;
  };
  const roleLabel = (e: AuditEntry) =>
    e.actorRole && messages.roles?.[e.actorRole] ? tr(e.actorRole) : (e.actorRole ?? '');
  const time = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  const dayHeading = (day: string) => {
    const d = new Date(`${day}T12:00:00Z`);
    const g =
      locale === 'ar'
        ? new Intl.DateTimeFormat('ar', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          }).format(d)
        : `${d.getUTCDate()} ${new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(d)} ${d.getUTCFullYear()}`;
    return day === localDay(new Date().toISOString()) ? t('todaySuffix', { date: g }) : g;
  };

  const num = new Intl.NumberFormat(locale === 'ar' ? 'ar' : 'en-US');

  const groups = useMemo(() => {
    const map = new Map<string, AuditEntry[]>();
    for (const e of entries) {
      const k = localDay(e.createdAt);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()];
  }, [entries]);

  if (forbidden) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <NoAccess capability="audit.read" />
      </div>
    );
  }

  const tileBody = (label: string, value: ReactNode) => (
    <>
      <span className="text-[11px] leading-4 font-medium text-muted-foreground uppercase ltr:tracking-[0.05em]">
        {label}
      </span>
      <span className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em] tabular-nums">
        {value}
      </span>
    </>
  );
  const TILE =
    'flex flex-col gap-[3px] rounded-xl bg-card p-4 text-start ring-1 ring-foreground/10';
  const tile = (label: string, value: ReactNode) => (
    <div className={TILE}>{tileBody(label, value)}</div>
  );

  return (
    <div className="flex max-w-[1240px] flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        <div className="flex min-w-0 grow flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">
            {summary ? t('summary', { count: summary.eventsToday }) : t('summaryRetention')}
          </p>
        </div>
        {canExport && (
          <Button
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={() => void exportCsv()}
            className="shrink-0 self-start sm:self-auto"
          >
            {exporting ? t('exporting') : t('export')}
          </Button>
        )}
      </div>
      {exportNote && (
        <p role="status" className="-mt-2 text-xs leading-4 text-muted-foreground">
          {exportNote}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {tile(t('tileToday'), summary ? num.format(summary.eventsToday) : '—')}
        {tile(t('tileActors'), summary ? num.format(summary.actors) : '—')}
        {summary ? (
          // The tile is the way in: it shows today's critical entries.
          <button
            type="button"
            onClick={showCritical}
            className={cn(
              TILE,
              'transition-colors outline-none hover:bg-neutral-50 focus-visible:ring-3 focus-visible:ring-ring/50',
            )}
          >
            {tileBody(t('tileCritical'), num.format(summary.critical))}
          </button>
        ) : (
          tile(t('tileCritical'), '—')
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="h-7 w-full text-sm sm:w-[280px]"
        />
        <Select value={actor} onValueChange={(v) => setActor(v ?? ALL)}>
          <SelectTrigger size="sm" className="w-full sm:w-[200px]" aria-label={t('actorLabel')}>
            <SelectValue>
              {(v) =>
                v === ALL
                  ? t('everyone')
                  : (staff.find((s) => s.id === v)?.displayName ?? String(v).slice(0, 8))
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('everyone')}</SelectItem>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.displayName ?? s.id.slice(0, 8)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={category}
          onValueChange={(v) => setCategory((v as AuditCategory | typeof ALL) ?? ALL)}
        >
          <SelectTrigger size="sm" className="w-full sm:w-[200px]" aria-label={t('categoryLabel')}>
            <SelectValue>
              {(v) => (v === ALL ? t('allCategories') : t(`category.${String(v)}`))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('allCategories')}</SelectItem>
            {AUDIT_CATEGORIES.map((c) => {
              const none = resourcesOf(c).length === 0;
              return (
                <SelectItem key={c} value={c} disabled={none}>
                  {none ? t('categorySoon', { name: t(`category.${c}`) }) : t(`category.${c}`)}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <Select value={win} onValueChange={(v) => setWin((v as Window) ?? 'all')}>
          <SelectTrigger size="sm" className="w-full sm:w-[200px]" aria-label={t('windowLabel')}>
            <SelectValue>{(v) => t(`window.${String(v)}`)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {WINDOWS.map((w) => (
              <SelectItem key={w} value={w}>
                {t(`window.${w}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={severity}
          onValueChange={(v) => setSeverity((v as Severity | typeof ALL) ?? ALL)}
        >
          <SelectTrigger size="sm" className="w-full sm:w-[200px]" aria-label={t('severityLabel')}>
            <SelectValue>
              {(v) => (v === ALL ? t('allSeverities') : t(`severity.${String(v)}`))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('allSeverities')}</SelectItem>
            {SEVERITIES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`severity.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="hidden grow sm:block" />
        {filtered && (
          <Button variant="ghost" size="sm" onClick={reset}>
            {t('clearFilters')}
          </Button>
        )}
      </div>

      {error && (
        <LoadError
          message={error}
          onRetry={() => void fetchPage()}
          hasContent={entries.length > 0}
        />
      )}

      {loading ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl bg-card px-6 py-14 text-center text-sm leading-5 text-muted-foreground ring-1 ring-foreground/10">
          {filtered ? t('emptyFiltered') : t('empty')}
        </div>
      ) : (
        <>
          {groups.map(([day, items], gi) => (
            <section
              key={day}
              aria-labelledby={`day-${day}`}
              className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
            >
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 bg-neutral-50 px-4 py-2.5">
                <h2 id={`day-${day}`} className="text-sm leading-5 font-medium">
                  {dayHeading(day)}
                </h2>
                <span className="text-xs leading-4 text-neutral-400">
                  {formatHijri(new Date(`${day}T12:00:00Z`), locale)}
                </span>
                <span className="grow" />
                <span className="font-mono text-xs text-muted-foreground">
                  {/* The list is paged: the last day shown may continue on the next
                      page, so its count is a floor, not the day's total. */}
                  {gi === groups.length - 1 && cursor
                    ? t('eventsMore', { count: items.length })
                    : t('events', { count: items.length })}
                </span>
              </div>
              <ul>
                {items.map((e) => {
                  const cat = categoryOf(e.resource);
                  return (
                    <li key={e.id} className="border-t">
                      <button
                        type="button"
                        onClick={() => setOpen(e)}
                        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-start transition-colors outline-none hover:bg-neutral-50 focus-visible:bg-neutral-50 sm:flex-nowrap"
                      >
                        <span className="w-11 shrink-0 font-mono text-xs leading-4 text-muted-foreground">
                          {time(e.createdAt)}
                        </span>
                        <Avatar name={actorName(e)} size="sm" />
                        <span className="flex w-36 shrink-0 flex-col">
                          <span className="truncate text-[13px] leading-[18px] font-medium">
                            {actorName(e)}
                          </span>
                          <span className="truncate text-[11px] leading-[15px] text-muted-foreground">
                            {roleLabel(e)}
                          </span>
                        </span>
                        <span className="flex min-w-0 grow basis-48 flex-col">
                          <span className="truncate text-[13px] leading-[18px]">
                            {actionLabel(e)}
                          </span>
                          <span className="truncate text-xs leading-4 text-muted-foreground">
                            {targetLabel(e)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] leading-5 font-medium',
                            CATEGORY_CLASS[cat],
                          )}
                        >
                          {t(`category.${cat}`)}
                        </span>
                        {/* Routine is most of the log — only what matters wears a pill. */}
                        {e.severity !== 'routine' && (
                          <StatusPill
                            tone={toneFor('auditSeverity', e.severity)}
                            className="shrink-0"
                          >
                            {t(`severity.${e.severity}`)}
                          </StatusPill>
                        )}
                        <ChevronRight
                          aria-hidden
                          className="hidden size-4 shrink-0 text-neutral-400 sm:block"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {cursor && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                disabled={loadingMore}
                onClick={() => void fetchPage(cursor)}
              >
                {loadingMore ? t('loading') : t('loadMore')}
              </Button>
            </div>
          )}
        </>
      )}

      <EntryDialog
        entry={open}
        actor={open ? actorName(open) : ''}
        role={open ? roleLabel(open) : ''}
        action={open ? actionLabel(open) : ''}
        target={open ? targetLabel(open) : ''}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
