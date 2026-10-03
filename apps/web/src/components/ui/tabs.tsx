'use client';

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cn } from '@/lib/utils';

// The People & Gro design system's underline Tabs (DS-06), on Base UI's Tabs so
// the tablist/tab/tabpanel roles, aria-selected and arrow-key movement come from
// the primitive rather than being re-implemented.
//
// The system's md size: 30px tabs, padding 4px 8px 6px, 14/20 medium, muted
// until selected; the selected tab carries a 2px near-black underline that sits
// ON the list's 1px border (margin-bottom -1px).

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col', className)} {...props} />
  );
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        // Scrolls sideways when seven tabs do not fit a phone, rather than wrapping
        // into two rows of underlines.
        'flex w-full items-center gap-1 overflow-x-auto border-b',
        className,
      )}
      {...props}
    />
  );
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(
        '-mb-px inline-flex h-[30px] shrink-0 items-center justify-center gap-1.5 border-b-2 border-transparent px-2 pt-1 pb-1.5 text-sm leading-5 font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none',
        'hover:text-foreground focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50',
        'data-active:border-[rgb(10,10,10)] data-active:text-foreground',
        'data-disabled:pointer-events-none data-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-panel"
      // Base UI makes the panel a tab stop; it keeps a VISIBLE focus ring, since a
      // focused element that shows nothing is a keyboard dead end (UX-11).
      className={cn(
        'rounded-xl outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring',
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTab, TabsPanel };
