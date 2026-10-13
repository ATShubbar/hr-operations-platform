import { tintFor } from '@/lib/department-tint';
import { cn } from '@/lib/utils';

// A department, as a soft-coloured pill (PEOPLE-01) — the size of a Badge. The
// colours are data (`lib/department-tint.ts`, checked for contrast in lint), so
// they are applied as a style rather than as utility classes.
export function DepartmentPill({
  department,
  className,
}: {
  department: string | null | undefined;
  className?: string;
}) {
  if (!department) return <span className="text-[13px] text-neutral-400">—</span>;
  const tint = tintFor(department);
  return (
    <span
      style={{ backgroundColor: tint.background, color: tint.text }}
      className={cn(
        'inline-flex h-5 max-w-full items-center rounded-full px-2 text-xs leading-4 font-medium',
        className,
      )}
    >
      <span className="truncate">{department}</span>
    </span>
  );
}
