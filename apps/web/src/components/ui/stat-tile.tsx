import type { ReactNode } from 'react';

import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

// StatTile (DS-03) — one number with a caption, the People & Gro KPI shape:
// an 11px caption, the figure at 30/36 in the display face, an optional line
// beneath. Replaces the hand-rolled `rounded-lg border p-4` boxes the Expiry and
// Reports screens each drew for themselves.
//
// Deliberately NO trend arrow, delta or sparkline slot. UX-04 settled that a KPI
// needs a baseline and a history to be honest, and the product has no snapshot
// table — a component with a trend slot would invite filling it with something
// invented. When a history exists, that is the card that adds the slot.
//
// When `href` is given the WHOLE tile is the link (one target, not a number plus
// a "view" link); otherwise it is plain content, never a fake button.

const FRAME = 'flex flex-col gap-1.5 rounded-xl bg-card p-4 ring-1 ring-foreground/10';

export function StatTile({
  label,
  value,
  sub,
  href,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  /** `#id` jumps within the page; anything else is a locale-aware route. */
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      {/* Caption tracking is LTR-only. Chrome 152 skips letter-spacing on
          Arabic outright (measured, DS-03); the guard is for engines that
          don't, and `uppercase` is a no-op there anyway. */}
      <span className="text-[11px] leading-4 font-medium text-muted-foreground uppercase ltr:tracking-[0.05em]">
        {label}
      </span>
      <span className="font-heading text-3xl leading-9 font-semibold tracking-[-0.02em] tabular-nums">
        {value}
      </span>
      {sub && <span className="text-xs leading-4 text-muted-foreground">{sub}</span>}
    </>
  );

  if (!href) return <div className={cn(FRAME, className)}>{body}</div>;

  const linkClass = cn(
    FRAME,
    'transition-shadow outline-none hover:ring-foreground/25 focus-visible:ring-3 focus-visible:ring-ring/50',
    className,
  );
  return href.startsWith('#') ? (
    <a href={href} className={linkClass}>
      {body}
    </a>
  ) : (
    <Link href={href} className={linkClass}>
      {body}
    </Link>
  );
}
