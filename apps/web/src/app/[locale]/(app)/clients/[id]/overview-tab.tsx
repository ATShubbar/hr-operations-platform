'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { ClientResponse, EmployeeResponse } from '@hr/contracts';
import { bandAbove, bandBelow } from '@hr/contracts/client-profile';
import { formatHijri } from '@hr/dates';
import { BandPill } from '@/components/client-profile-bits';
import type { ClientFigures } from '../client-figures';
import { RunwayTable } from '../runway-table';
import { SaudiShare } from '../saudi-share';

// The Client record's Overview (DS-10): five tiles, the Nitaqat and Service panels,
// and the expiry runway (runway-table.tsx, shared with the Overview) — the
// prototype's layout.
//
// Nitaqat position (PROF-03, ADR-019): the company's STORED band — what staff
// read off Qiwa, with the day they read it — the prototype's note for that band,
// and the bands one step up and down the ladder. Nothing here is calculated: the
// Saudi share bar beside it is a count by nationality and says so, and it takes
// its colour from the stored band, never from the percentage. No band on file is
// said plainly. Everything in Service still reads "Soon" (PROF-05).

const TILES = ['headcount', 'saudi', 'expiring30', 'openItems', 'waiting'] as const;

export function OverviewTab({
  client,
  figures,
  staff,
}: {
  client: ClientResponse;
  figures: ClientFigures;
  staff: readonly EmployeeResponse[];
}) {
  const t = useTranslations('clients');
  const tp = useTranslations('clientProfile');
  const locale = useLocale() as 'ar' | 'en';
  const band = client.nitaqat?.band ?? null;
  const up = band ? bandAbove(band) : null;
  const down = band ? bandBelow(band) : null;
  // Red and yellow carry their own note; every other band shares one.
  const noteKey = band === 'red' || band === 'yellow' ? band : 'clear';
  const checked = client.nitaqat
    ? {
        date: new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
          numberingSystem: 'latn',
        }).format(new Date(`${client.nitaqat.checkedOn}T00:00:00Z`)),
        hijri: formatHijri(new Date(`${client.nitaqat.checkedOn}T00:00:00Z`), locale),
      }
    : null;
  const field = (label: string, value: string, muted = false) => (
    <div className="flex flex-col gap-px">
      <span className="text-xs leading-4 text-muted-foreground">{label}</span>
      <span
        className={
          muted ? 'text-[13px] leading-[18px] text-neutral-400' : 'text-[13px] leading-[18px]'
        }
      >
        {value}
      </span>
    </div>
  );
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
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 id="nitaqat" className="text-base leading-6 font-medium">
                {t('nitaqat')}
              </h2>
              <BandPill band={band} />
            </div>
            <p className="text-[13px] leading-[18px] text-pretty text-muted-foreground">
              {band ? t(`nitaqatNote.${noteKey}`) : t('nitaqatNone')}
            </p>
            {checked && (
              <p className="text-xs leading-4 text-muted-foreground">
                <span>
                  <bdi>{t('nitaqatChecked', checked)}</bdi>
                </span>
              </p>
            )}
          </div>
          <SaudiShare pct={figures.saudiPct} label={t('saudiShare')} band={band} />
          <p className="text-xs leading-4 text-neutral-500">{t('shareNote')}</p>
          <div className="grid grid-cols-2 gap-3 border-t pt-3">
            {band
              ? field(t('bandUp'), up ? tp(`band.${up}`) : t('bandTop'), !up)
              : field(t('bandUp'), tp('notRecorded'), true)}
            {band
              ? field(t('bandDown'), down ? tp(`band.${down}`) : t('bandBottom'), !down)
              : field(t('bandDown'), tp('notRecorded'), true)}
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
