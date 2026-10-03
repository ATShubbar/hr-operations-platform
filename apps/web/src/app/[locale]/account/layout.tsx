import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Signed-out account pages (SS-06b). `no-referrer`: the set-password link carries
// its one-time token in the URL fragment, which browsers never send — but this
// makes sure no part of these pages' addresses leaves for another origin either
// (a font, an image, a link the person follows).
export const metadata: Metadata = { referrer: 'no-referrer' };

export default function AccountLayout({ children }: { children: ReactNode }) {
  return children;
}
