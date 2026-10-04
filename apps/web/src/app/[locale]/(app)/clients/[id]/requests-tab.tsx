'use client';

import { useLocale, useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import type { RequestResponse } from '@hr/contracts';
import { Link } from '@/i18n/navigation';
import { toneFor } from '@/lib/status-tone';
import { StatusPill } from '@/components/ui/status-pill';

// The Client record's Requests tab (DS-11): everything this company has asked
// for and where each stands, newest first — the prototype's list. Each row opens
// the request on the Requests screen (`?r=`, DS-08), which owns deciding it. The
// prototype's service-level text becomes the request's due date (no SLA is stored).

export function RequestsTab({ requests }: { requests: readonly RequestResponse[] }) {
  const t = useTranslations('clients');
  const tr = useTranslations('requests');
  const locale = useLocale();
  const rows = [...requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const day = (iso: string) => {
    const d = new Date(iso);
    if (locale === 'ar') {
      return new Intl.DateTimeFormat('ar', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(d);
    }
    const month = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(d);
    return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
  };

  return (
    <section
      aria-labelledby="client-requests"
      className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
    >
      <div className="flex flex-col gap-0.5 px-5 py-4">
        <h2 id="client-requests" className="text-base leading-6 font-medium">
          {t('requestsTitle')}
        </h2>
        <p className="text-[13px] leading-[18px] text-muted-foreground">{t('requestsHint')}</p>
      </div>
      {rows.length === 0 ? (
        <p className="border-t px-5 py-7 text-center text-[13px] leading-[18px] text-neutral-400">
          {t('requestsEmpty')}
        </p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.id} className="border-t">
              <Link
                href={`/requests?r=${r.id}`}
                className="flex items-center gap-3 px-5 py-3 transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/60"
              >
                <span className="flex min-w-0 grow flex-col gap-px">
                  <span className="truncate text-sm leading-5 font-medium">{r.title}</span>
                  <span className="truncate text-xs leading-4 text-muted-foreground">
                    {[
                      tr(`type.${r.type}`),
                      r.requester?.name,
                      t('submittedOn', { date: day(r.createdAt) }),
                      r.dueDate ? t('dueOn', { date: day(r.dueDate) }) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <StatusPill tone={toneFor('request', r.status)} className="shrink-0">
                  {tr(`status.${r.status}`)}
                </StatusPill>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-neutral-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
