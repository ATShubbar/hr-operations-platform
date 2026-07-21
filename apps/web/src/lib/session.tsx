'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { MeResponse } from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api';

// Session context (AUTH-08). SessionProvider is the client-side route guard for
// the authenticated app: it resolves GET /auth/me once, redirects to /login on
// any failure, and renders its children only when a session is established.
// useCan() reads the actor's capability list so the UI shows/hides actions.
const SessionContext = createContext<MeResponse | null>(null);

export function useSession(): MeResponse {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used within a loaded SessionProvider');
  return session;
}

export function useCan(permission: string): boolean {
  return useSession().permissions.includes(permission);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<MeResponse | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<MeResponse>('/auth/me')
      .then((me) => {
        if (active) setSession(me);
      })
      .catch(() => {
        // No (valid) session → back to sign-in.
        if (active) router.replace('/login');
      });
    return () => {
      active = false;
    };
  }, [router]);

  if (!session) return null;
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
