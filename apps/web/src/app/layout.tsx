import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'HR Operations Platform',
  description: 'HR operations for a Saudi HR consultancy',
};

// lang/dir become dynamic with the i18n scaffold (WS-16); until then this
// shell is intentionally minimal.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
