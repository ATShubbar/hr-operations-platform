'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  ReportCatalogResponse,
  ReportDescriptor,
  ReportResultResponse,
} from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { dualDate, type Locale } from '@/lib/employee-format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadError, NoAccess } from '@/components/ui/load-state';
import { SkeletonRegion, SkeletonRows } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// Reports console (REP-04). The catalog arrives ALREADY filtered by the API to
// what this caller may run (REP-02), so the page never has to reason about
// permissions to decide what to offer — it renders what it is given. The only
// permission check here is cosmetic: hiding a download button that would 403.
//
// One generic table renders every report. That is the whole point of the shared
// {columns, rows, summary} shape (REP-01): adding a seventh report needs no
// front-end change beyond its labels.
export default function ReportsPage() {
  const t = useTranslations('reports');
  // Skeleton and error-state copy lives in one shared namespace: a per-screen
  // `loading` key silently announced "calendar.loading" to screen readers when
  // the namespace happened not to define one (UX-06).
  const tStates = useTranslations('states');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const canExport = useCan('report.export');

  const [reports, setReports] = useState<ReportDescriptor[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [result, setResult] = useState<ReportResultResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Column headers and cell values arrive as stable keys; translate when we have
  // a message for them and fall back to what the API sent, so a new report shows
  // its English label rather than a missing-key crash.
  const label = (key: string, fallback: string) => (t.has(`column.${key}`) ? t(`column.${key}`) : fallback);
  const value = (raw: string) => (t.has(`value.${raw}`) ? t(`value.${raw}`) : raw);

  const onUnauthorized = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login');
        return true;
      }
      return false;
    },
    [router],
  );

  // Extracted from the effects so the error state can re-run them in place —
  // a retry that only reloads the page would lose the selected report (UX-06).
  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<ReportCatalogResponse>('/reports');
      setReports(res.reports);
      setSelected((cur) => cur || res.reports[0]?.id || '');
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else if (!onUnauthorized(err)) setError(t('error'));
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized, t]);

  const runReport = useCallback(
    async (id: string) => {
      if (!id) return;
      setLoading(true);
      setError('');
      try {
        setResult(await apiFetch<ReportResultResponse>(`/reports/${id}`));
      } catch (err) {
        setResult(null);
        if (!onUnauthorized(err)) setError(t('error'));
      } finally {
        setLoading(false);
      }
    },
    [onUnauthorized, t],
  );

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    void runReport(selected);
  }, [selected, runReport]);

  // The export is a file download, not JSON — fetched directly so the CSV bytes
  // (BOM and all) reach the browser untouched.
  async function download() {
    if (!result) return;
    setExporting(true);
    setError('');
    try {
      const res = await fetch(`/api/reports/${result.id}/export?format=csv`, {
        credentials: 'include',
      });
      if (!res.ok) throw new ApiError(res.status, 'export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${result.id}-${result.generatedAt.slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (!onUnauthorized(err)) setError(t('exportError'));
    } finally {
      setExporting(false);
    }
  }

  const cell = (raw: string | number | null, numeric: boolean) => {
    if (raw === null || raw === '') return '—';
    if (typeof raw === 'number') return raw.toLocaleString(locale);
    return numeric ? raw : value(raw);
  };

  // Deep-linked without the capability: the nav hides the link, a pasted URL does
  // not. A refusal is not a failure, so it replaces the screen and offers no retry.
  if (forbidden) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <NoAccess capability="report.read" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {reports.length === 0 && !loading ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          {t('noReports')}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {reports.map((r) => (
            <Button
              key={r.id}
              variant={r.id === selected ? 'default' : 'outline'}
              onClick={() => setSelected(r.id)}
            >
              {t(`report.${r.id}`)}
            </Button>
          ))}
        </div>
      )}

      {error && (
        <LoadError
          message={error}
          // Retry whichever step failed: with no catalog there is nothing to run.
          onRetry={() => void (reports.length === 0 ? loadCatalog() : runReport(selected))}
          hasContent={Boolean(result)}
        />
      )}

      {result && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-medium">{t(`report.${result.id}`)}</h2>
                <Badge variant="secondary">
                  {t(`category.${categoryOf(reports, result.id)}`)}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('generatedAt', {
                  date: dualDate(result.generatedAt, locale) ?? result.generatedAt.slice(0, 10),
                })}
              </p>
            </div>
            {canExport && (
              <Button variant="outline" onClick={() => void download()} disabled={exporting}>
                {exporting ? t('exporting') : t('exportCsv')}
              </Button>
            )}
          </div>

          {/* whole-report totals */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Object.entries(result.summary).map(([key, total]) => (
              <div key={key} className="rounded-lg border p-4">
                <div className="text-2xl font-semibold">{total.toLocaleString(locale)}</div>
                <div className="mt-1 text-sm text-muted-foreground">{label(key, key)}</div>
              </div>
            ))}
          </div>

          {result.rows.length === 0 ? (
            <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
              {t('noRows')}
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table label={t(`report.${result.id}`)}>
                <TableHeader>
                  <TableRow>
                    {result.columns.map((c) => (
                      <TableHead key={c.key} className={c.numeric ? 'text-end' : undefined}>
                        {label(c.key, c.label)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.map((row, i) => (
                    <TableRow key={i}>
                      {result.columns.map((c) => (
                        <TableCell
                          key={c.key}
                          className={
                            c.numeric
                              ? 'whitespace-nowrap text-end tabular-nums'
                              : 'whitespace-nowrap'
                          }
                        >
                          {cell(row[c.key] ?? null, c.numeric)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      )}

      {loading && (
        <SkeletonRegion label={tStates('loading')} className="rounded-lg border bg-card p-3">
          <SkeletonRows rows={5} columns={5} />
        </SkeletonRegion>
      )}
    </div>
  );
}

function categoryOf(reports: ReportDescriptor[], id: string): string {
  return reports.find((r) => r.id === id)?.category ?? 'workforce';
}
