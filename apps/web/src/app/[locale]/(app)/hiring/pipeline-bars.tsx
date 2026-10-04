'use client';

import { useTranslations } from 'next-intl';
import type { CandidateResponse } from '@hr/contracts';
import { cn } from '@/lib/utils';
import { COLUMNS, type Column } from './stages';

// The hiring pipeline as bars, one per board column (DS-11; shared with the
// Overview in DS-17). Each bar is that column's share of the candidates given —
// pass the ACTIVE ones (rejected and withdrawn have left the board). The Visa &
// mobilisation column is the board's "coming soon" one and counts nothing yet.

// The board's ramp: the pipeline in ink, the visa stage amber, onboarded green.
const FILL: Record<Column, string> = {
  applied: 'bg-neutral-900',
  screening: 'bg-neutral-900',
  interview: 'bg-neutral-900',
  offer: 'bg-neutral-900',
  visa: 'bg-status-warning',
  hired: 'bg-status-ok',
};

export function PipelineBars({ candidates }: { candidates: readonly CandidateResponse[] }) {
  const th = useTranslations('hiring');
  return (
    <ul className="flex flex-col gap-3">
      {COLUMNS.map((col) => {
        const n = col === 'visa' ? 0 : candidates.filter((c) => c.stage === col).length;
        const pct = candidates.length ? Math.round((n / candidates.length) * 100) : 0;
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
