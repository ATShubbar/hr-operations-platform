import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// StatusPill (UX-02) — workflow state, where colour is SEMANTIC.
//
// Deliberately a different component from Badge: Badge is arbitrary metadata
// whose colour is decorative (a brand-gold "New" badge is fine), while a status
// pill answers "what state is this record in", so its colour carries meaning and
// must come from the --status-* tier. Merging them is what produced the
// inconsistency the audit found, where `terminated` and `on_leave` shared a grey.
//
// Three encodings, not one: tone (colour), a dot (shape/position), and the label
// itself. Colour is never the only channel — that is what WCAG 1.4.1 requires,
// and it is also what makes these readable for the ~1-in-12 men with a red-green
// deficiency, for whom red carries no urgency at all.
// DS-01: the People & Gro "soft" treatment — a fully rounded pill, a tint behind,
// no outline. The system draws that tint at 10% of a mid-strength hue and sets the
// label in the SAME hue, and measured that way all four tones fail WCAG AA for
// 12px text: info 3.62:1, error 4.13:1, success 2.96:1, warning 2.86:1. So the
// shape is the system's and the colours stay ours — the label is the deep status
// tone on its pale surface, re-measured by scripts/verify-status-contrast.mjs.
// The outline goes because it never carried the signal (UX-01: WCAG 1.4.11
// exempts the boundary of a control whose meaning is in its own text).
const statusPillVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        critical: 'bg-status-critical-surface text-status-critical',
        warning: 'bg-status-warning-surface text-status-warning',
        ok: 'bg-status-ok-surface text-status-ok',
        info: 'bg-status-info-surface text-status-info',
        neutral: 'bg-status-neutral-surface text-status-neutral',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type StatusTone = NonNullable<VariantProps<typeof statusPillVariants>['tone']>;

function StatusPill({
  className,
  tone = 'neutral',
  dot = true,
  render,
  children,
  ...props
}: useRender.ComponentProps<'span'> &
  VariantProps<typeof statusPillVariants> & { dot?: boolean }) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      {
        className: cn(statusPillVariants({ tone }), className),
        children: (
          <>
            {dot && (
              // currentColor = the tone, which measures 6.0–8.9:1 against card —
              // comfortably past the 3:1 a graphical object needs. The decorative
              // hairline is far too light to carry this, by design.
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full bg-current"
              />
            )}
            {children}
          </>
        ),
      },
      props,
    ),
    render,
    state: { slot: 'status-pill', tone },
  });
}

export { StatusPill, statusPillVariants };
