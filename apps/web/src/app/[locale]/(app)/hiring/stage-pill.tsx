import { stageTint } from '@/lib/stage-tint';
import { cn } from '@/lib/utils';

// A candidate's stage, as a soft-coloured pill (HIRING-01) — the size of a Badge.
// The colours are data (`lib/stage-tint.ts`, checked for contrast in lint), so
// they are applied as a style. The colour says which stage; the pill always
// carries its name.
export function StagePill({
  stage,
  label,
  className,
}: {
  stage: string;
  label: string;
  className?: string;
}) {
  const tint = stageTint(stage);
  return (
    <span
      style={{ backgroundColor: tint.background, color: tint.text }}
      className={cn(
        'inline-flex h-5 max-w-full items-center rounded-full px-2 text-xs leading-4 font-medium',
        className,
      )}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}
