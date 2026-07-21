import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { SessionProvider } from '@/lib/session';

// Authenticated area (AUTH-08): SessionProvider guards every page here — it
// resolves /auth/me, redirects to /login without a session, and only then
// renders the role-aware shell + page.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
