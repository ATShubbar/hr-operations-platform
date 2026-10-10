'use client';

import { useTranslations } from 'next-intl';
import type { ClientResponse, NitaqatBand } from '@hr/contracts';
import { StatusPill } from '@/components/ui/status-pill';
import { toneFor } from '@/lib/status-tone';
import { cn } from '@/lib/utils';

// Small pieces of the client profile (PROF-02, ADR-019) that several screens
// draw the same way: the Nitaqat band as a pill, and the "sector · city · CR"
// line under a company's name.

/** The STORED Nitaqat band. No band on file reads as that — never as a colour. */
export function BandPill({
  band,
  className,
}: {
  band: NitaqatBand | null | undefined;
  className?: string;
}) {
  const t = useTranslations('clientProfile');
  if (!band) {
    return (
      <span className={cn('text-xs leading-4 text-neutral-400', className)}>{t('bandNone')}</span>
    );
  }
  return (
    <StatusPill tone={toneFor('nitaqat', band)} className={className}>
      <span className="sr-only">{t('bandLabel', { band: t(`band.${band}`) })}</span>
      <span aria-hidden>{t(`band.${band}`)}</span>
    </StatusPill>
  );
}

/** "Construction · Riyadh · CR 1010224417" — only the parts on file. */
export function ProfileLine({
  client,
  className,
}: {
  client: Pick<ClientResponse, 'sector' | 'city' | 'crNumber'>;
  className?: string;
}) {
  const t = useTranslations('clientProfile');
  const parts = [
    client.sector && t(`sector.${client.sector}`),
    client.city && t(`city.${client.city}`),
    client.crNumber && t('cr', { number: client.crNumber }),
  ].filter((p): p is string => Boolean(p));
  if (parts.length === 0) {
    return <span className={cn('text-neutral-400', className)}>{t('lineNone')}</span>;
  }
  return (
    <span className={cn('text-muted-foreground', className)}>
      {/* One isolated run (ADR-012): an Arabic line keeps its number in place. */}
      <bdi>{parts.join(' · ')}</bdi>
    </span>
  );
}
