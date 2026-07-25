'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { MeResponse } from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { LoadError } from '@/components/ui/load-state';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';

// Session context (AUTH-08). SessionProvider is the client-side route guard for
// the authenticated app: it resolves GET /auth/me and renders its children only
// when a session is established. useCan() reads the actor's capability list so
// the UI shows and hides actions.
//
// UX-06 changed how failure is handled here, and the reason is worth recording.
// This used to redirect to /login on ANY rejection, which conflates two very
// different things:
//
//   401/403 → there is no usable session. Sign-in is the correct destination.
//   anything else (network down, 500, timeout) → the session is probably FINE,
//             the server just could not be reached.
//
// Under the old behaviour a dead API logged you out of the interface: every
// screen's careful error-with-retry state was unreachable, because the guard
// bounced first and dumped you on the sign-in form — which then also failed.
// Found by stopping the API mid-session: navigating anywhere landed on /ar/login
// with a valid cookie still in the jar. A non-401 failure now keeps you in the
// app and offers a retry.
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
  const t = useTranslations('states');
  const [session, setSession] = useState<MeResponse | null>(null);
  const [failed, setFailed] = useState(false);

  const resolve = useCallback(async () => {
    setFailed(false);
    try {
      setSession(await apiFetch<MeResponse>('/auth/me'));
    } catch (err) {
      // Only an actual "not authenticated" answer sends you to sign-in.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace('/login');
        return;
      }
      setFailed(true);
    }
  }, [router]);

  useEffect(() => {
    void resolve();
  }, [resolve]);

  if (failed) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <LoadError onRetry={() => void resolve()} />
      </div>
    );
  }

  // Was `return null` — a blank white page for as long as /auth/me took.
  if (!session) {
    return (
      <SkeletonRegion label={t('loading')} className="mx-auto max-w-lg space-y-3 px-4 py-16">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-24 w-full" />
      </SkeletonRegion>
    );
  }

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
