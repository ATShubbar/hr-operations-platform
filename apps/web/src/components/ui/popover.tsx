'use client';

import { Popover as PopoverPrimitive } from '@base-ui/react/popover';

import { cn } from '@/lib/utils';

// Popover (UX-02). Replaces the hand-rolled notification panel, which had no
// Escape key, no aria-expanded, no focus management, and was positioned with a
// bare `end-0` — so in Arabic it opened toward the viewport edge with nothing to
// push it back.
//
// Base UI's Positioner does collision detection and flips/shifts, and it reads
// direction from DirectionProvider (added in the root layout) — which is required
// because Base UI does NOT read `dir` from the DOM, and a popover portals outside
// the element that carries it.
function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger(props: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = 'end',
  side = 'bottom',
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Popup> & {
  align?: PopoverPrimitive.Positioner.Props['align'];
  side?: PopoverPrimitive.Positioner.Props['side'];
  sideOffset?: number;
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner align={align} side={side} sideOffset={sideOffset}>
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            'z-50 w-80 max-w-[calc(100vw-2rem)] origin-[var(--transform-origin)] rounded-xl border bg-popover p-0 text-popover-foreground shadow-lg outline-none',
            'data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95',
            'data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverContent };
