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
// ADR-012 (pixel-exact fidelity, owner decision): the People & Gro soft badge
// AS DESIGNED — status hue on its own 10% tint. This replaces DS-01's choice to
// keep our deeper AA tones in the system's shape; the system's colours measure
// 2.86–4.13:1 for 12px text (below AA), a trade-off the owner accepted. The tones
// live in globals.css (--status-*); restoring the UX-01 values is the reversal.
const statusPillVariants = cva(
  // The system's Badge, size sm (ADR-012): 18px tall, 1px 8px padding, 4px gap,
  // 12/16 medium, a 6px currentColor dot.
  'inline-flex h-[18px] w-fit shrink-0 items-center gap-1 rounded-full px-2 py-px text-xs leading-4 font-medium whitespace-nowrap',
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
}: useRender.ComponentProps<'span'> & VariantProps<typeof statusPillVariants> & { dot?: boolean }) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      {
        className: cn(statusPillVariants({ tone }), className),
        children: (
          <>
            {dot && (
              // currentColor = the tone (the system's Badge dot). Since ADR-012 the
              // tones are the prototype's mid-strength hues.
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
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
