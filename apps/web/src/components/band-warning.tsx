'use client';

import { useLocale, useTranslations } from 'next-intl';
import { TriangleAlert } from 'lucide-react';
import type { ClientResponse } from '@hr/contracts';
import { bandWarning, type BandCheck } from '@hr/contracts/client-profile';

// The Nitaqat band warning (PROF-06, ADR-019). Shown at the moment of an action
// a Red or Yellow band bears on — a non-Saudi hire; on Red also a work-permit
// renewal or a sponsorship transfer — inside the confirmation that action
// already shows. WHETHER it shows is `bandWarning`, the one shared rule.
//
// It never blocks. The band is what staff recorded from Qiwa and may be out of
// date, so the warning names the band, says when it was last checked, and says
// the person can still go ahead. Nothing is rendered when there is nothing to
// say — including when no band is on file (the app does not guess).

export interface BandSource {
  /** The company's name, in the viewer's language. */
  client: string;
  nitaqat: ClientResponse['nitaqat'];
}

export function BandWarning({
  source,
  check,
}: {
  source: BandSource | null | undefined;
  check: BandCheck;
}) {
  const t = useTranslations('bandWarning');
  const tp = useTranslations('clientProfile');
  const locale = useLocale();
  const band = bandWarning(source?.nitaqat?.band, check);
  if (!source?.nitaqat || !band) return null;

  const checked = new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
    numberingSystem: 'latn',
  }).format(new Date(`${source.nitaqat.checkedOn}T00:00:00Z`));

  return (
    <div
      role="note"
      className="flex items-start gap-2.5 rounded-md bg-status-warning-surface px-3.5 py-3 ring-1 ring-status-warning-line"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] leading-[18px] font-medium">
          <bdi>{t('title', { client: source.client, band: tp(`band.${band}`) })}</bdi>
        </span>
        <span className="text-xs leading-4 text-muted-foreground">
          <bdi>{t(`${check.kind}.${band}`)}</bdi>
        </span>
        <span className="text-xs leading-4 text-muted-foreground">
          <bdi>{t('checked', { date: checked })}</bdi>
        </span>
      </span>
    </div>
  );
}
