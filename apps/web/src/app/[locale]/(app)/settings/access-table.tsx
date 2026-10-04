'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AccessLevel, AccessResponse } from '@hr/contracts';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { LoadError } from '@/components/ui/load-state';
import { Skeleton } from '@/components/ui/skeleton';

// Settings → Access (DS-21) — the prototype's Settings screen: what each role
// can see on an employee record. Read-only: GET /access computes it from the
// rules the API enforces (role bundles + the redaction tiers), so it cannot
// promise more or less than the endpoints do. Changing a row is a later feature
// (owner: editable field access comes LAST), and the note says so.
//
// All six roles, as on Roles and permissions (DS-19); the prototype shows four
// because it has no Auditor or employee column.

const TONE: Record<AccessLevel, string> = {
  full: 'text-foreground',
  own_company: 'text-foreground',
  own_record: 'text-foreground',
  hidden: 'text-neutral-400',
  none: 'text-neutral-400',
};

export function AccessTable() {
  const t = useTranslations('settings.access');
  const tr = useTranslations('roles');
  const [data, setData] = useState<AccessResponse | null>(null);
  const [error, setError] = useState(false);

  const load = () => {
    setError(false);
    apiFetch<AccessResponse>('/access')
      .then(setData)
      .catch(() => setError(true));
  };
  useEffect(load, []);

  if (error) return <LoadError message={t('error')} onRetry={load} />;
  if (!data) return <Skeleton className="h-72 w-full rounded-xl" />;

  return (
    <section
      aria-labelledby="access-title"
      className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
    >
      <div className="flex flex-col gap-0.5 p-4">
        <h2 id="access-title" className="text-base leading-6 font-medium">
          {t('title')}
        </h2>
        <p className="text-[13px] leading-[18px] text-muted-foreground">{t('subtitle')}</p>
      </div>
      <div
        role="region"
        aria-labelledby="access-title"
        tabIndex={0}
        className="overflow-x-auto border-t focus-visible:outline-2 focus-visible:outline-ring"
      >
        <table className="w-full min-w-[860px] border-separate border-spacing-0 text-[13px] leading-[18px]">
          <thead>
            <tr className="bg-neutral-100 text-xs leading-4 text-muted-foreground">
              <th scope="col" className="w-[220px] px-4 py-2.5 text-start font-medium">
                {t('groupCol')}
              </th>
              {data.roles.map((r) => (
                <th key={r} scope="col" className="px-4 py-2.5 text-start font-medium">
                  {tr(r)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.group} className="h-11">
                <th scope="row" className="border-t px-4 text-start font-normal">
                  {t(`group.${row.group}`)}
                </th>
                {data.roles.map((r) => {
                  const level = row.access[r];
                  return (
                    <td key={r} className={cn('border-t px-4', level && TONE[level])}>
                      {level ? t(`level.${level}`) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t px-4 py-2.5 text-xs leading-4 text-muted-foreground">
        {t('editingSoon')}
      </p>
    </section>
  );
}
