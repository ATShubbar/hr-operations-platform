// The Saudi share of the register, as a bar. Deliberately ONE colour: the
// prototype paints it green / amber / red by Nitaqat-like thresholds, but those
// thresholds depend on sector and size — colouring a nationality count by them
// would pass a judgement this figure cannot make (the Nitaqat feature will).
export function SaudiShare({ pct, label }: { pct: number; label: string }) {
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
        <div className="h-2 rounded-full bg-neutral-900" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
