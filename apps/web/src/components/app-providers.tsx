'use client';

import type { ReactNode } from 'react';
import { DirectionProvider } from '@base-ui/react/direction-provider';

import { ToastProvider } from '@/components/ui/toast';

// Client-side providers (UX-02).
//
// DirectionProvider is not cosmetic and it is not redundant with `dir` on <html>.
// Base UI's docs are explicit that it "does not affect HTML and CSS" — the `dir`
// attribute handles the pixels — but that Base UI components need it to adjust
// their BEHAVIOUR: which way an arrow key moves through a select, which side a
// popover aligns to, which direction a swipe dismisses. Base UI does not read
// `dir` from the DOM, and portalled popups sit outside the element that carries
// it anyway.
//
// Its absence was a latent bug across every screen: Arabic is the default locale,
// so the app has been shipping LTR-handed keyboard behaviour to its primary
// audience since the first Select landed.
export function AppProviders({ direction, children }: { direction: 'ltr' | 'rtl'; children: ReactNode }) {
  return (
    <DirectionProvider direction={direction}>
      <ToastProvider>{children}</ToastProvider>
    </DirectionProvider>
  );
}
