'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { ClientResponse } from '@hr/contracts';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { ClientFigures } from '../clients/client-figures';

// The Overview's client portfolio table (DS-17) — one row per company: headcount,
// Nitaqat band ("soon"), Saudisation, expiring in 30 days, open items. Staff see
// every active client, each opening its Client record; a client manager sees
// their own row only, with no link (DS-18 — they have no Client record screen).
// The note under it says what the two derived columns mean (client-figures.ts).

const expiringTone = (n: number) =>
  n > 3 ? 'text-status-critical' : n > 1 ? 'text-status-warning' : 'text-neutral-500';

export function PortfolioTable({
  labelledBy,
  clients,
  figuresOf,
  linkToRecord = false,
}: {
  labelledBy: string;
  clients: readonly ClientResponse[];
  figuresOf: (c: ClientResponse) => ClientFigures;
  linkToRecord?: boolean;
}) {
  const t = useTranslations('overview');
  const ts = useTranslations('states');
  const locale = useLocale();

  return (
    <>
      <div
        role="region"
        aria-labelledby={labelledBy}
        tabIndex={0}
        className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring"
      >
        <table className="w-full min-w-[680px] border-separate border-spacing-0 text-[13px] leading-[18px]">
          <colgroup>
            <col style={{ width: '25%' }} />
            <col style={{ width: '12.5%' }} />
            <col style={{ width: '16.25%' }} />
            <col style={{ width: '12.5%' }} />
            <col style={{ width: '12.5%' }} />
            <col style={{ width: '12.5%' }} />
          </colgroup>
          <thead>
            <tr className="bg-neutral-100 text-xs leading-4 text-muted-foreground">
              <th scope="col" className="px-4 py-2 text-start font-medium">
                {t('col.client')}
              </th>
              <th scope="col" className="px-4 py-2 text-end font-medium">
                {t('col.headcount')}
              </th>
              <th scope="col" className="px-4 py-2 text-start font-medium">
                {t('col.band')}
              </th>
              <th scope="col" className="px-4 py-2 text-end font-medium">
                {t('col.saudi')}
              </th>
              <th scope="col" className="px-4 py-2 text-end font-medium">
                {t('col.expiring')}
              </th>
              <th scope="col" className="px-4 py-2 text-end font-medium">
                {t('col.open')}
              </th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td colSpan={6} className="border-t px-4 py-8 text-center text-neutral-400">
                  {t('portfolioEmpty')}
                </td>
              </tr>
            ) : (
              clients.map((c) => {
                const f = figuresOf(c);
                const name = (
                  <>
                    <span className="text-sm leading-5 font-medium">
                      {locale === 'ar' ? c.name.ar : c.name.en}
                    </span>
                    {locale === 'en' && (
                      <span
                        dir="rtl"
                        className="text-start text-xs leading-4 text-muted-foreground"
                      >
                        {c.name.ar}
                      </span>
                    )}
                  </>
                );
                return (
                  <tr key={c.id} className="h-14 [&>td]:border-t [&>td]:px-4">
                    <th scope="row" className="border-t px-4 py-2 text-start font-normal">
                      {linkToRecord ? (
                        <Link
                          href={`/clients/${c.id}`}
                          className="flex flex-col gap-px outline-none hover:underline focus-visible:underline"
                        >
                          {name}
                        </Link>
                      ) : (
                        <span className="flex flex-col gap-px">{name}</span>
                      )}
                    </th>
                    <td className="text-end font-mono">{f.headcount}</td>
                    <td className="text-xs text-neutral-400">{ts('soon')}</td>
                    <td className="text-end font-mono">{f.saudiPct}%</td>
                    <td className={cn('text-end font-mono', expiringTone(f.expiring30))}>
                      {f.expiring30}
                    </td>
                    <td className="text-end font-mono">{f.openItems}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t px-4 py-2.5 text-xs leading-4 text-muted-foreground">
        {t('portfolioNote')}
      </p>
    </>
  );
}
