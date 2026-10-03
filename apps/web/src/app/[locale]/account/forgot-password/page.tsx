'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { AuthFrame } from '@/components/auth-frame';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// "Forgot password" (SS-06b) over POST /me/password-reset, which answers 202 to
// everything. The page mirrors that: after submitting, ONE message whatever was
// typed — a real address, an unknown one, a staff address, a network failure —
// so the page cannot be used to learn who has an account. It says plainly that
// this is for EMPLOYEE accounts; staff passwords are reset by an administrator.
export default function ForgotPasswordPage() {
  const t = useTranslations('account');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch('/me/password-reset', { method: 'POST', body: JSON.stringify({ email }) });
    } catch {
      // Deliberately indistinguishable from success.
    } finally {
      setBusy(false);
      setSent(true);
    }
  }

  return (
    <AuthFrame
      title={t('forgotTitle')}
      subtitle={sent ? t('forgotSent') : t('forgotSubtitle')}
      footer={t('staffNote')}
    >
      {sent ? (
        <Link href="/login" className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}>
          {t('backToSignIn')}
        </Link>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">{t('email')}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? t('sending') : t('sendLink')}
          </Button>
          <p className="text-center text-sm">
            <Link
              href="/login"
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {t('backToSignIn')}
            </Link>
          </p>
        </form>
      )}
    </AuthFrame>
  );
}
