import type { NitaqatBand } from '@hr/contracts';
import { cn } from '@/lib/utils';

// The Saudi share of the register, as a bar. The FIGURE is a count by
// nationality, and stays labelled as that. Its colour comes from the company's
// STORED Nitaqat band (ADR-019) — red on a red band, amber on yellow, ink
// otherwise — as the prototype paints it. It is never coloured by a threshold
// on the percentage: those depend on sector and size, and a count by
// nationality cannot pass that judgement. No band on file = ink.
const FILL: Partial<Record<NitaqatBand, string>> = {
  red: 'bg-status-critical',
  yellow: 'bg-status-warning',
};

export function SaudiShare({
  pct,
  label,
  band,
}: {
  pct: number;
  label: string;
  band?: NitaqatBand | null;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="grow text-xs leading-4 text-muted-foreground">{label}</span>
        <span className="font-mono text-xs">{pct}%</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 overflow-hidden rounded-full bg-neutral-100"
      >
        <div
          className={cn('h-2 rounded-full', (band && FILL[band]) ?? 'bg-neutral-900')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
