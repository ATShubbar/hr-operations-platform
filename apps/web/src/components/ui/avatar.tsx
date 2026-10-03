import { cn } from '@/lib/utils';

// The People & Gro design system's Avatar (DS-05): a neutral-100 disc with a 1px
// inset border ring, initials at weight 400. Sizes are the system's own table —
// xs 20 · sm 24 · md 32 · lg 40 · xl 56, with matching type.
const SIZE = {
  xs: 'size-5 text-[10px] leading-[14px]',
  sm: 'size-6 text-xs leading-4',
  md: 'size-8 text-base leading-6',
  lg: 'size-10 text-lg leading-[26px]',
  xl: 'size-14 text-[22px] leading-[30px]',
} as const;

// Initials for an avatar. An Arabic name gets ONE letter: two Arabic letters
// side by side are joined by the shaper into something that reads as a
// (meaningless) word, not as two initials.
export function initialsOf(name: string | null | undefined): string {
  if (!name) return '·';
  const words = name.trim().split(/\s+/);
  if (/[؀-ۿ]/.test(name)) return words[0]!.charAt(0);
  const first = words[0]!.charAt(0);
  const last = words.length > 1 ? words[words.length - 1]!.charAt(0) : '';
  return (first + last).toUpperCase();
}

export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string | null | undefined;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  // Decorative: the name it abbreviates is always printed beside it.
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-neutral-100 font-normal text-foreground shadow-[inset_0_0_0_1px_var(--border)]',
        SIZE[size],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
