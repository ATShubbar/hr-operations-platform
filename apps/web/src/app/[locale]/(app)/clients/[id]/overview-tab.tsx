'use client';

import { useTranslations } from 'next-intl';
import type { EmployeeResponse } from '@hr/contracts';
import { cn } from '@/lib/utils';
import { RUNWAY_BANDS, runwayFor, type ClientFigures, type RunwayBand } from '../client-figures';
import { SaudiShare } from '../saudi-share';

// The Client record's Overview (DS-10): five tiles, the Nitaqat and Service panels,
// and the expiry runway — the prototype's layout.
//
// The Nitaqat band, the bands above and below, and everything in Service (named
// officer, tier, response commitment, term) are not stored — they belong to the
// Nitaqat and client profile features — so they read "Soon". The Saudi share bar is
// real (nationality on the register) and says so in its label.

const TILES = ['headcount', 'saudi', 'expiring30', 'openItems', 'waiting'] as const;

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

export function OverviewTab({
  figures,
  staff,
}: {
  figures: ClientFigures;
  staff: readonly EmployeeResponse[];
}) {
  const t = useTranslations('clients');
  const tp = useTranslations('people');
  const runway = runwayFor(staff);
  const tileValue = (k: (typeof TILES)[number]) =>
    k === 'saudi' ? `${figures.saudiPct}%` : String(figures[k]);

  const soonField = (label: string) => (
    <div className="flex flex-col gap-px">
      <span className="text-xs leading-4 text-muted-foreground">{label}</span>
      <span className="text-[13px] leading-[18px] text-neutral-400">{t('soon.value')}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {TILES.map((k) => (
          <div
            key={k}
            className="flex flex-col gap-[3px] rounded-xl bg-card p-4 ring-1 ring-foreground/10"
          >
            <dt className="text-[11px] leading-4 font-medium text-muted-foreground uppercase ltr:tracking-[0.05em]">
              {t(`tile.${k}`)}
            </dt>
            <dd className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em] tabular-nums">
              {tileValue(k)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section
          aria-labelledby="nitaqat"
          className="flex flex-col gap-3 rounded-xl bg-card px-5 py-[18px] ring-1 ring-foreground/10"
        >
          <div className="flex flex-col gap-0.5">
            <h2 id="nitaqat" className="text-base leading-6 font-medium">
              {t('nitaqat')}
            </h2>
            <p className="text-[13px] leading-[18px] text-pretty text-muted-foreground">
              {t('nitaqatSoon')}
            </p>
          </div>
          <SaudiShare pct={figures.saudiPct} label={t('saudiShare')} />
          <div className="grid grid-cols-2 gap-3 border-t pt-3">
            {soonField(t('bandUp'))}
            {soonField(t('bandDown'))}
          </div>
        </section>

        <section
          aria-labelledby="service"
          className="flex flex-col gap-3 rounded-xl bg-card px-5 py-[18px] ring-1 ring-foreground/10"
        >
          <h2 id="service" className="text-base leading-6 font-medium">
            {t('service')}
          </h2>
          <div className="flex flex-col gap-px">
            <span className="text-xs leading-4 text-muted-foreground">{t('namedOfficer')}</span>
            <span className="text-[13px] leading-[18px] text-neutral-400">{t('soon.value')}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-3">
            {soonField(t('tier'))}
            {soonField(t('responseCommitment'))}
            {soonField(t('termEnds'))}
          </div>
        </section>
      </div>

      <section
        aria-labelledby="runway"
        className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
      >
        <div className="flex flex-col gap-0.5 px-5 py-4">
          <h2 id="runway" className="text-base leading-6 font-medium">
            {t('runway')}
          </h2>
          <p className="text-[13px] leading-[18px] text-muted-foreground">{t('runwayHint')}</p>
        </div>
        <div
          role="region"
          aria-labelledby="runway"
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
              {runway.map((row) => (
                <tr key={row.key} className="h-11 [&>td]:border-t">
                  <th scope="row" className="border-t px-4 text-start font-normal">
                    {tp(`doc.${row.key}`)}
                  </th>
                  {row.stored ? (
                    <>
                      {RUNWAY_BANDS.map((b) => (
                        <td key={b.key} className={cn('text-center font-mono', BAND_CELL[b.key])}>
                          {row.counts[b.key]}
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
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
