'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { SequenceInFlight, SequenceInFlightListResponse } from '@hr/contracts';
import { Avatar } from '@/components/ui/avatar';
import { Link } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api';
import { useCan } from '@/lib/session';
import { cn } from '@/lib/utils';

// "Mobilisations and exits" (MOB-05, ADR-018) — the prototype's panel on the
// Overview and on Reports: every onboarding and final exit still running, each
// with how far it has got and the step that can be filed next. A row opens the
// person's Mobilisation tab, where the work is done.
//
// Staff only: the API refuses everyone else, and a role without `gro.read`
// gets no panel at all rather than an empty one. The panel loads its own list,
// so a screen adds it without another entry in its own loader; company names
// come from the list the screen already holds.

type Load =
  { state: 'loading' } | { state: 'error' } | { state: 'ready'; runs: SequenceInFlight[] };

export function SequencesPanel({
  id,
  clientNames,
}: {
  /** The heading's id — unique per screen. */
  id: string;
  /** Company id → name, in the viewer's language. */
  clientNames: ReadonlyMap<string, string>;
}) {
  const t = useTranslations('inFlight');
  const tm = useTranslations('person.mob');
  const locale = useLocale() as 'ar' | 'en';
  const canRead = useCan('gro.read');
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  useEffect(() => {
    if (!canRead) return;
    let live = true;
    apiFetch<SequenceInFlightListResponse>('/gro-sequences')
      .then((res) => live && setLoad({ state: 'ready', runs: res.sequences }))
      .catch(() => live && setLoad({ state: 'error' }));
    return () => {
      live = false;
    };
  }, [canRead]);

  if (!canRead) return null;

  const note = (text: string) => (
    <p className="border-t px-5 py-6 text-center text-[13px] leading-[18px] text-neutral-400">
      {text}
    </p>
  );

  return (
    <section
      aria-labelledby={id}
      className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
    >
      <div className="flex flex-col gap-0.5 px-5 py-4">
        <h2 id={id} className="text-base leading-6 font-medium">
          {t('title')}
        </h2>
        <p className="text-[13px] leading-[18px] text-muted-foreground">{t('hint')}</p>
      </div>
      {load.state === 'loading' && note(t('loading'))}
      {load.state === 'error' && note(t('loadError'))}
      {load.state === 'ready' && load.runs.length === 0 && note(t('empty'))}
      {load.state === 'ready' && load.runs.length > 0 && (
        <ul>
          {load.runs.map((run) => {
            const done = run.steps.filter((s) => s.state === 'filed').length;
            const total = run.steps.length;
            const pct = total === 0 ? 0 : Math.round((done / total) * 100);
            const next = run.steps.find((s) => s.state === 'ready');
            const name = locale === 'ar' ? run.employee.name.ar : run.employee.name.en;
            const client = clientNames.get(run.clientId);
            // Each LINE is one isolated run (ADR-012: the layout is LTR in both
            // locales): an Arabic line then reads name-first from its own right
            // edge and keeps a Latin word (GAMCA) in place, instead of being cut
            // into runs laid out left to right.
            const nextLine = next
              ? t('next', { title: tm(`step.${next.key}.title`) })
              : t('nothingWaiting');
            return (
              <li key={run.id} className="border-t">
                <Link
                  href={`/employees/${run.employee.id}?tab=mob`}
                  className="flex flex-col gap-2 px-5 py-3 outline-none hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset sm:flex-row sm:items-center sm:gap-3"
                >
                  <span className="flex min-w-0 grow items-center gap-3">
                    <Avatar name={run.employee.name.en} size="sm" />
                    <span className="flex min-w-0 grow flex-col gap-px">
                      <span className="truncate text-[13px] leading-[18px] font-medium">
                        <bdi>
                          {name} · {tm(`kind.${run.kind}.label`)}
                        </bdi>
                      </span>
                      <span className="truncate text-[11px] leading-[15px] text-muted-foreground">
                        <bdi>{client ? `${client} · ${nextLine}` : nextLine}</bdi>
                      </span>
                    </span>
                  </span>
                  <span className="flex w-full shrink-0 flex-col gap-1 sm:w-40">
                    <span className="flex items-baseline gap-2">
                      <span className="grow text-[11px] leading-[15px] text-muted-foreground">
                        <bdi>{tm('filedOf', { done, total })}</bdi>
                      </span>
                      <span className="font-mono text-[11px]">{pct}%</span>
                    </span>
                    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                      <span
                        className={cn(
                          'block h-1.5 rounded-full',
                          // An exit reads amber, a mobilisation in ink — the prototype's split.
                          run.kind === 'final_exit' ? 'bg-status-warning' : 'bg-neutral-900',
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
