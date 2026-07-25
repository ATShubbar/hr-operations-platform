'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { MenuIcon } from 'lucide-react';

import { AppNav } from '@/components/app-nav';
import { Button } from '@/components/ui/button';
import { usePathname } from '@/i18n/navigation';

// The mobile navigation sheet (UX-05).
//
// Before this, the sidebar was `hidden … md:flex` and the header's only mobile
// element was a static text label — so below 768px all thirteen nav links were in
// the DOM and none were reachable. That is not a degraded experience, it is a
// product with no navigation.
//
// Built from Base UI's Dialog PRIMITIVES rather than by passing a className to
// our DialogContent: that component hard-codes
// `top-1/2 start-1/2 -translate-x-1/2 rtl:translate-x-1/2`, and tailwind-merge
// treats `rtl:translate-x-*` as a different group from `translate-x-*`, so an
// override would drop the LTR transform and silently keep the RTL one. A sheet is
// a different shape from a centred modal and gets its own component.
//
// Focus trap, Escape, focus-return and scroll lock all come from the primitive —
// the same argument that replaced the hand-rolled notification panel in UX-02.
export function MobileNav() {
  const t = useTranslations();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close AFTER the route commits, not in the link's onClick.
  //
  // Closing during the click looks equivalent and is not: next/link calls
  // `startTransition(() => router.push(...))`, and closing in the same click
  // unmounts the subtree that owns that transition, so the navigation is
  // discarded. Measured — the sheet closed and the URL never changed, while the
  // identical link in the desktop sidebar navigated fine.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Crossing to the desktop breakpoint reveals the real sidebar, which would
  // leave the sheet stacked on top of it. Rotating a phone is enough to do it.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        // 44px (WCAG 2.5.5): the button is md:hidden, so this is a thumb target
        // only — and it is the single control that decides whether the app has
        // navigation at all. The variant's 28px passes 2.5.8 AA but is mean for
        // the primary affordance on a phone.
        render={<Button variant="ghost" size="icon-sm" className="size-11 md:hidden" />}
        aria-label={t('nav.openMenu')}
        aria-expanded={open}
      >
        <MenuIcon aria-hidden className="size-5" />
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 md:hidden" />
        <DialogPrimitive.Popup
          className="fixed inset-y-0 start-0 z-50 flex h-dvh w-72 max-w-[85vw] flex-col overflow-y-auto border-e bg-sidebar text-sidebar-foreground shadow-xl outline-none duration-150 data-open:animate-in data-open:slide-in-from-start data-closed:animate-out data-closed:slide-out-to-start md:hidden"
          // `slide-in-from-start` / `slide-out-to-start` are direction-aware
          // (tw-animate-css resolves them through `:dir()`), so in Arabic the
          // sheet enters from the right without a second class.
        >
          <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
            <DialogPrimitive.Title className="text-sm font-semibold">
              {t('common.appName')}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              render={<Button variant="ghost" size="sm" />}
              aria-label={t('nav.closeMenu')}
            >
              {t('nav.closeMenu')}
            </DialogPrimitive.Close>
          </div>
          <AppNav variant="sheet" />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
