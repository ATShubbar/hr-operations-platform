'use client';

import { useTranslations } from 'next-intl';
import type { EmployeeResponse } from '@hr/contracts';
import type { ClientFigures } from '../client-figures';
import { RunwayTable } from '../runway-table';
import { SaudiShare } from '../saudi-share';

// The Client record's Overview (DS-10): five tiles, the Nitaqat and Service panels,
// and the expiry runway (runway-table.tsx, shared with the Overview) — the
// prototype's layout.
//
// The Nitaqat band, the bands above and below, and everything in Service (named
// officer, tier, response commitment, term) are not stored — they belong to the
// Nitaqat and client profile features — so they read "Soon". The Saudi share bar is
// real (nationality on the register) and says so in its label.

const TILES = ['headcount', 'saudi', 'expiring30', 'openItems', 'waiting'] as const;

export function OverviewTab({
  figures,
  staff,
}: {
  figures: ClientFigures;
  staff: readonly EmployeeResponse[];
}) {
  const t = useTranslations('clients');
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

      <RunwayTable id="runway" hint={t('runwayHint')} staff={staff} />
    </div>
  );
}
