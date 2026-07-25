'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { matchesAnyField } from '@hr/text';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { SkeletonRegion, SkeletonRows } from '@/components/ui/skeleton';

// DataTable (UX-03). Every list in the app previously had no search, no sort and
// no paging, so with a real dataset the only way to find a record was Ctrl-F over
// a fully rendered table — and Employees, the primary entity, was the worst case.
//
// Deliberately hand-rolled rather than pulling in a table engine: the API returns
// complete arrays today, so this is sorting, filtering and slicing an array. If we
// move to server-side pagination, that is the moment to revisit — not now.
//
// Choices that came out of the research:
//   • 40px rows at 14px text (the density every published design system lands on),
//     with a compact option later if anyone asks.
//   • Numeric columns end-aligned with tabular figures, so digits line up.
//   • Row actions ALWAYS VISIBLE. Hover-only controls measured a >20% drop in
//     discoverability, and hover does not exist on the tablets used in a back office.
//   • Offset pagination with a real total — "312 employees" is frequently the
//     answer the person came for, and cursors cannot show it.
//   • Sortable headers are real <button>s carrying aria-sort, and only one column
//     may carry it at a time, so multi-sort is deliberately not offered.

export interface Column<T> {
  key: string;
  header: string;
  /** Cell content. Keep it cheap — this runs for every visible row. */
  cell: (row: T) => ReactNode;
  /** Value used for sorting; omit to make the column unsortable. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Strings this column contributes to the search box. */
  searchValues?: (row: T) => (string | null | undefined)[];
  numeric?: boolean;
  className?: string;
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

const PAGE_SIZES = [25, 50, 100];

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading = false,
  searchPlaceholder,
  filters,
  onClearFilters,
  actions,
  emptyTitle,
  emptyDescription,
  emptyAction,
  initialSort,
  className,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  searchPlaceholder?: string;
  /** Screen-specific filter chips, rendered before the search box. */
  filters?: ReactNode;
  /** Shown when any filter is active, so a filtered empty list has a way out. */
  onClearFilters?: () => void;
  /** Per-row actions, rendered in a trailing always-visible cell. */
  actions?: (row: T) => ReactNode;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  initialSort?: SortState;
  className?: string;
}) {
  const t = useTranslations('table');
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState>(initialSort ?? null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]!);

  const searchable = columns.filter((c) => c.searchValues);

  const filtered = useMemo(() => {
    if (!query.trim() || searchable.length === 0) return rows;
    // Arabic-aware: a plain includes() would silently miss the most common way
    // Arabic is typed (see @hr/text). Never replace this with String.includes.
    return rows.filter((row) =>
      matchesAnyField(searchable.flatMap((c) => c.searchValues!(row)), query),
    );
  }, [rows, query, searchable]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return filtered;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      // Empty values sort last in both directions — a blank expiry is not "earliest".
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), locale) * dir;
    });
  }, [filtered, sort, columns, locale]);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount - 1);
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize);

  const toggleSort = (key: string) =>
    setSort((s) =>
      s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    );

  const isFiltered = Boolean(query.trim()) || Boolean(onClearFilters);
  const colSpan = columns.length + (actions ? 1 : 0);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {searchable.length > 0 && (
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0); // a new query must not leave you on page 4 of 1
            }}
            placeholder={searchPlaceholder ?? t('search')}
            className="h-9 w-full max-w-xs rounded-lg"
            aria-label={searchPlaceholder ?? t('search')}
          />
        )}
        {filters}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    // Only one column may carry aria-sort at a time — which is
                    // also why multi-column sort is not offered.
                    aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cn(
                      'whitespace-nowrap px-3 py-2 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                      c.numeric && 'text-end',
                      c.className,
                    )}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={cn(
                          'inline-flex items-center gap-1 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                          active && 'text-foreground',
                        )}
                      >
                        {c.header}
                        <span aria-hidden className="text-[10px] opacity-60">
                          {active ? (sort!.dir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
              {actions && <th scope="col" className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colSpan} className="p-0">
                  <SkeletonRegion label={t('loading')}>
                    <SkeletonRows rows={5} columns={Math.min(columns.length, 5)} />
                  </SkeletonRegion>
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="p-0">
                  {/* A filtered miss and a genuinely empty list are different
                      states with opposite remedies — never a create CTA when the
                      user has just filtered. */}
                  {isFiltered && rows.length > 0 ? (
                    <EmptyState
                      variant="no-results"
                      title={t('noResults')}
                      description={t('noResultsHint')}
                      action={
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setQuery('');
                            onClearFilters?.();
                          }}
                        >
                          {t('clearFilters')}
                        </Button>
                      }
                      className="border-0"
                    />
                  ) : (
                    <EmptyState
                      variant="first-run"
                      title={emptyTitle}
                      description={emptyDescription}
                      action={emptyAction}
                      className="border-0"
                    />
                  )}
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={rowKey(row)} className="border-b last:border-b-0 hover:bg-muted/40">
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'h-10 whitespace-nowrap px-3 align-middle',
                        c.numeric && 'text-end tabular-nums',
                        c.className,
                      )}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                  {actions && (
                    <td className="h-10 whitespace-nowrap px-3 text-end align-middle">
                      {actions(row)}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && total > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {t('showing', {
              from: current * pageSize + 1,
              to: Math.min(total, (current + 1) * pageSize),
              total,
            })}
          </span>
          <select
            aria-label={t('perPage')}
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(0);
            }}
            className="rounded-md border bg-card px-1.5 py-1 tabular-nums"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <div className="ms-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              {t('prev')}
            </Button>
            <span className="tabular-nums">{t('pageOf', { page: current + 1, pages: pageCount })}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
            >
              {t('next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
