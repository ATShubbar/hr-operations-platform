'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import type { MeResponse } from '@hr/contracts';
import { apiFetch, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LanguageSwitcher } from '@/components/language-switcher';

interface LoginResponse {
  userId: string;
  principalType: string;
  mfaRequired?: boolean;
  mfaEnrollRequired?: boolean;
}

type Step = 'credentials' | 'enroll' | 'challenge';

// Login + MFA (AUDIT-05). Drives the AUTH-02/06 API: credentials → full
// session (redirect), or a limited session that must enroll (admin first
// login) or answer a challenge (already enrolled). The httpOnly cookie is set
// by the API through the /api proxy; this component only branches on the JSON.
export default function LoginPage() {
  const t = useTranslations('auth');
  const router = useRouter();

  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Land on the first section the actor can actually use (role-aware, AUTH-08):
  // admins → audit; other staff → clients. Falls back to clients.
  async function goToApp() {
    try {
      const me = await apiFetch<MeResponse>('/auth/me');
      router.replace(me.permissions.includes('audit.read') ? '/audit' : '/clients');
    } catch {
      router.replace('/clients');
    }
  }

  async function submitCredentials(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (res.mfaEnrollRequired) {
        const enroll = await apiFetch<{ otpauthUri: string }>('/auth/mfa/enroll', {
          method: 'POST',
        });
        setSecret(new URL(enroll.otpauthUri).searchParams.get('secret') ?? '');
        setStep('enroll');
      } else if (res.mfaRequired) {
        setStep('challenge');
      } else {
        void goToApp();
      }
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? t('invalidCredentials')
          : t('genericError'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: FormEvent, path: string) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await apiFetch(path, { method: 'POST', body: JSON.stringify({ code }) });
      void goToApp();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401 ? t('invalidCode') : t('genericError'),
      );
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<Step, string> = {
    credentials: t('signInTitle'),
    enroll: t('mfaEnrollTitle'),
    challenge: t('mfaChallengeTitle'),
  };
  const subtitles: Record<Step, string> = {
    credentials: t('signInSubtitle'),
    enroll: t('mfaEnrollSubtitle'),
    challenge: t('mfaChallengeSubtitle'),
  };

  const codeField = (
    <div className="space-y-1.5">
      <Label htmlFor="code">{t('code')}</Label>
      <Input
        id="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={t('codePlaceholder')}
        maxLength={6}
        required
      />
    </div>
  );

  return (
    <main className="flex min-h-dvh items-center justify-center ps-4 pe-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle>{titles[step]}</CardTitle>
            <LanguageSwitcher />
          </div>
          <CardDescription>{subtitles[step]}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'credentials' && (
            <form onSubmit={submitCredentials} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">{t('email')}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('emailPlaceholder')}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">{t('password')}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('passwordPlaceholder')}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? t('signingIn') : t('signIn')}
              </Button>
            </form>
          )}

          {step === 'enroll' && (
            <form onSubmit={(e) => submitCode(e, '/auth/mfa/verify')} className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t('mfaSecretLabel')}</Label>
                <code className="block rounded-md bg-muted px-3 py-2 text-sm break-all">
                  {secret}
                </code>
              </div>
              {codeField}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? t('verifying') : t('verify')}
              </Button>
            </form>
          )}

          {step === 'challenge' && (
            <form onSubmit={(e) => submitCode(e, '/auth/mfa/challenge')} className="space-y-4">
              {codeField}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? t('verifying') : t('verify')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
