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
  label,
  filtersActive,
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
  /** Accessible name for the scrollable table region. */
  label?: string;
  /**
   * True when a filter OUTSIDE this component (a server-side query param, a
   * status chip) is narrowing `rows`. Drives the empty-vs-no-results split, which
   * this component cannot infer for filters it does not own.
   */
  filtersActive?: boolean;
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

  // "Did the user narrow this list?" decides which empty state is honest.
  //
  // The search box is ours, so we know about it. Server-side filters are not:
  // several screens fetch with query params, so an empty result is indistinguish-
  // able from an empty table unless the screen tells us (`filtersActive`). Without
  // that, someone who filtered to nothing gets "no documents yet — upload one",
  // which is both wrong and the exact anti-pattern UX-03 set out to avoid.
  const narrowed = Boolean(query.trim()) || Boolean(filtersActive);
  const colSpan = columns.length + (actions ? 1 : 0);

  return (
    <div className={cn('space-y-3', className)}>
      {/* `items-end`, not `items-center`: a screen may give its filters visible
          labels (documents does), which makes those children taller than the
          bare search box. Aligning on the bottom keeps every control on one
          baseline. Identical to `items-center` where nothing is labelled. */}
      <div className="flex flex-wrap items-end gap-2">
        {searchable.length > 0 && (
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0); // a new query must not leave you on page 4 of 1
            }}
            placeholder={searchPlaceholder ?? t('search')}
            // 32px to match SelectTrigger's `data-[size=default]:h-8`, which is
            // an attribute variant and therefore beats a plain `h-9` passed in
            // by a filter — measured, search 36px vs filters 32px in the same
            // row (UX-13). Aligning here rather than fighting the variant.
            className="h-8 w-full max-w-xs rounded-lg"
            aria-label={searchPlaceholder ?? t('search')}
          />
        )}
        {filters}
        {/* Clear lives in the toolbar, not in each screen's markup (UX-13).
            The no-results state already offered it, which is exactly when you
            need it LEAST — you can see there is nothing there. With two or three
            filters active over a full table, resetting them one Select at a time
            is the tedious case, and it was the one affordance the Apply-button
            forms had that the inline shape dropped.

            Rendered only while something is narrowing the list, so the toolbar
            stays quiet by default. */}
        {narrowed && onClearFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => {
              setQuery('');
              onClearFilters();
            }}
          >
            {t('clearFilters')}
          </Button>
        )}
      </div>

      {/* A horizontally scrolling region must be reachable by keyboard (WCAG
          2.1.1): without tabindex, a table wider than the viewport — which is the
          normal case on a phone — has columns a keyboard-only user cannot reach
          at all. Focusable + role=region + a name is the standard pairing.
          Fixed here rather than on the twelve raw tables because UX-03c migrates
          them onto this component. */}
      <div
        role="region"
        aria-label={label ?? t('regionLabel')}
        tabIndex={0}
        className="overflow-x-auto rounded-lg border bg-card focus-visible:outline-2 focus-visible:outline-ring"
      >
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
                  {narrowed ? (
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
