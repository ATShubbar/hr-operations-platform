'use client';

import { useTranslations } from 'next-intl';
import type { EmployeeResponse } from '@hr/contracts';
import { Link } from '@/i18n/navigation';
import type { DocKey } from '@/lib/employee-docs';
import { cn } from '@/lib/utils';
import { RUNWAY_BANDS, runwayFor, type RunwayBand } from './client-figures';

// The expiry runway (DS-10; shared with the Overview in DS-17): each document type
// × how much time is left, over the people given. The Client record passes one
// company's register; the Overview passes everyone under management and makes
// each cell a link to that cohort on People.
//
// The prototype adds three rows for dependants' documents. Dependants are not
// stored yet (the Family tab is "coming soon"), so those rows say so rather than
// showing zeros that would read as "none expiring".

// The prototype tints the two urgent bands' cells and colours their headings;
// later bands are muted. `overdue` (our addition) reads as the most urgent.
const BAND_HEAD: Record<RunwayBand, string> = {
  overdue: 'text-status-critical',
  d7: 'text-status-critical',
  d14: 'text-status-warning',
  d30: 'text-muted-foreground',
  d60: 'text-muted-foreground',
  d90: 'text-muted-foreground',
};
const BAND_CELL: Record<RunwayBand, string> = {
  overdue: 'bg-status-critical/[0.06]',
  d7: 'bg-status-critical/[0.06]',
  d14: 'bg-status-warning/[0.06]',
  d30: '',
  d60: 'text-muted-foreground',
  d90: 'text-muted-foreground',
};
const DEPENDANT_ROWS = ['iqama', 'insurance', 'passport'] as const;

export function RunwayTable({
  id,
  hint,
  staff,
  cellHref,
}: {
  /** The heading's id — the section and its scroll region are named by it. */
  id: string;
  hint: string;
  staff: readonly EmployeeResponse[];
  /** Where a cell leads: a document, and a band (null = every band). Omitted = plain numbers. */
  cellHref?: (doc: DocKey, band: RunwayBand | null) => string;
}) {
  const t = useTranslations('clients');
  const tp = useTranslations('people');
  const runway = runwayFor(staff);

  const cell = (doc: DocKey, band: RunwayBand | null, body: string | number, title: string) =>
    cellHref ? (
      <Link
        href={cellHref(doc, band)}
        title={title}
        className="flex h-11 items-center justify-center outline-none hover:bg-neutral-900/[0.04] hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        {body}
      </Link>
    ) : (
      body
    );

  return (
    <section
      aria-labelledby={id}
      className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
    >
      <div className="flex flex-col gap-0.5 px-5 py-4">
        <h2 id={id} className="text-base leading-6 font-medium">
          {t('runway')}
        </h2>
        <p className="text-[13px] leading-[18px] text-muted-foreground">{hint}</p>
      </div>
      <div
        role="region"
        aria-labelledby={id}
        tabIndex={0}
        className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring"
      >
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-[13px] leading-[18px]">
          <thead>
            <tr className="bg-neutral-100 text-xs leading-4 font-medium">
              <th scope="col" className="px-4 py-2 text-start font-medium text-muted-foreground">
                {t('runwayDoc')}
              </th>
              {RUNWAY_BANDS.map((b) => (
                <th
                  key={b.key}
                  scope="col"
                  className={cn('px-3 py-2 text-center font-medium', BAND_HEAD[b.key])}
                >
                  {t(`band.${b.key}`)}
                </th>
              ))}
              <th scope="col" className="px-4 py-2 text-end font-medium text-muted-foreground">
                {t('tracked')}
              </th>
            </tr>
          </thead>
          <tbody>
            {runway.map((row) => {
              const label = tp(`doc.${row.key}`);
              return (
                <tr key={row.key} className="h-11 [&>td]:border-t">
                  <th scope="row" className="border-t px-4 text-start font-normal">
                    {row.stored && cellHref ? (
                      <Link
                        href={cellHref(row.key, null)}
                        className="outline-none hover:underline focus-visible:underline"
                      >
                        {label}
                      </Link>
                    ) : (
                      label
                    )}
                  </th>
                  {row.stored ? (
                    <>
                      {RUNWAY_BANDS.map((b) => (
                        <td key={b.key} className={cn('text-center font-mono', BAND_CELL[b.key])}>
                          {cell(
                            row.key,
                            b.key,
                            row.counts[b.key],
                            `${label} · ${t(`band.${b.key}`)}`,
                          )}
                        </td>
                      ))}
                      <td className="px-4 text-end font-mono text-muted-foreground">
                        {row.tracked}
                      </td>
                    </>
                  ) : (
                    <td
                      colSpan={RUNWAY_BANDS.length + 1}
                      className="px-4 text-center text-xs text-neutral-400"
                    >
                      {t('notStoredYet')}
                    </td>
                  )}
                </tr>
              );
            })}
            {DEPENDANT_ROWS.map((k) => (
              <tr key={`dep-${k}`} className="h-11 [&>td]:border-t">
                <th scope="row" className="border-t px-4 text-start font-normal">
                  {t(`dependantDoc.${k}`)}
                </th>
                <td
                  colSpan={RUNWAY_BANDS.length + 1}
                  className="px-4 text-center text-xs text-neutral-400"
                >
                  {t('notStoredYet')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
