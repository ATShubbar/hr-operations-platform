'use client';

import { useTranslations } from 'next-intl';
import type { CandidateResponse, VacancyPipeline } from '@hr/contracts';
import { cn } from '@/lib/utils';
import { COLUMNS, type Column } from './stages';

// The hiring pipeline as bars, one per board column (DS-11; shared with the
// Overview in DS-17). It takes COUNTS per stage, so a client manager's Overview
// can draw it from their vacancies' pipeline counts (DS-18) without ever reading
// a candidate; staff screens build the counts with `countsOf`. Each bar is that
// stage's share of the total. The Visa & mobilisation column is the board's
// "coming soon" one and counts nothing yet.

// The board's ramp: the pipeline in ink, the visa stage amber, onboarded green.
const FILL: Record<Column, string> = {
  applied: 'bg-neutral-900',
  screening: 'bg-neutral-900',
  interview: 'bg-neutral-900',
  offer: 'bg-neutral-900',
  visa: 'bg-status-warning',
  hired: 'bg-status-ok',
};

/** Per-stage counts of candidates still on the board (rejected / withdrawn left it). */
export function countsOf(candidates: readonly CandidateResponse[]): VacancyPipeline {
  const out: VacancyPipeline = { applied: 0, screening: 0, interview: 0, offer: 0, hired: 0 };
  for (const c of candidates) if (c.stage in out) out[c.stage as keyof VacancyPipeline] += 1;
  return out;
}

export function PipelineBars({ counts }: { counts: VacancyPipeline }) {
  const th = useTranslations('hiring');
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <ul className="flex flex-col gap-3">
      {COLUMNS.map((col) => {
        const n = col === 'visa' ? 0 : counts[col];
        const pct = total ? Math.round((n / total) * 100) : 0;
        return (
          <li key={col} className="flex items-center gap-3">
            <span className="w-[118px] shrink-0 text-xs leading-4 text-neutral-700">
              {th(`column.${col}`)}
            </span>
            {col === 'visa' ? (
              // The board's "coming soon" column: no bar to draw, so say so.
              <span className="grow text-[11px] leading-4 text-neutral-400">{th('soon')}</span>
            ) : (
              <span
                aria-hidden
                className="block h-2 grow overflow-hidden rounded-full bg-neutral-100"
              >
                <span
                  className={cn('block h-2 rounded-full', FILL[col])}
                  style={{ width: `${pct}%` }}
                />
              </span>
            )}
            <span className="w-6 shrink-0 text-end font-mono text-xs">{n}</span>
          </li>
        );
      })}
    </ul>
  );
}
