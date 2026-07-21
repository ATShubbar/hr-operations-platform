'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';

// Real revocation (AUTH-05): POST /auth/logout destroys the server session,
// then we return to the login screen regardless of the call's outcome.
export function SignOutButton() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // Even if revocation fails, drop the user back to sign-in.
    } finally {
      router.replace('/login');
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={signOut} disabled={busy}>
      {t('signOut')}
    </Button>
  );
}
