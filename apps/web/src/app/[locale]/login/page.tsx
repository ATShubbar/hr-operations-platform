'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import type { ConfigEffectiveResponse, MeResponse } from '@hr/contracts';
import { apiFetch, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrandMark } from '@/components/brand-mark';
import { LanguageSwitcher } from '@/components/language-switcher';

interface LoginResponse {
  userId: string;
  principalType: string;
  mfaRequired?: boolean;
  mfaEnrollRequired?: boolean;
}

type Step = 'credentials' | 'enroll' | 'challenge';

// Sampled from the artwork, not approximated: the panel's ground has to match
// the photograph's own sky or the seam shows, and the rule has to be the mark's
// gold rather than our --primary, which is a different gold.
const BRAND_NAVY = '#040a31';
const BRAND_GOLD = '#f7ce46';

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
  // client reps → the portal (their only surface); admins → audit; other staff →
  // clients. Falls back to clients. Also honor the actor's stored ui.language
  // preference (CONF-05) — land in their language.
  async function goToApp() {
    try {
      const me = await apiFetch<MeResponse>('/auth/me');
      // UX-04: staff land on Today — their work queue — rather than on a list of
      // clients or the audit log. Client reps still land on the portal, which is
      // their only surface.
      const target = me.permissions.includes('portal.read') ? '/portal/company' : '/today';
      let preferred: 'ar' | 'en' | undefined;
      try {
        const cfg = await apiFetch<ConfigEffectiveResponse>('/config/me');
        const lang = cfg.settings['ui.language'];
        if (lang === 'ar' || lang === 'en') preferred = lang;
      } catch {
        // No preference reachable — land in the current locale.
      }
      router.replace(target, preferred ? { locale: preferred } : undefined);
    } catch {
      router.replace('/today');
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
        err instanceof ApiError && err.status === 401 ? t('invalidCredentials') : t('genericError'),
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
    // Two columns (UX-16, after shadcn's login-02): the form on the start side,
    // the brand panel on the end side from `lg` up. Below that the panel is
    // hidden entirely rather than stacked — it carries identity, not
    // information, and a phone should reach the password field without scrolling
    // past a photograph.
    //
    // `grid-cols-2`, not two positioned halves, so RTL mirrors it for free.
    <div className="grid min-h-dvh lg:grid-cols-2">
      <main className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex items-center justify-between gap-2">
          <BrandMark width={148} />
          <LanguageSwitcher />
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <div className="mb-6 flex flex-col items-center gap-1 text-center">
              {/* Still the page's only title, so still the h1 (UX-11). */}
              <h1 className="text-2xl font-semibold">{titles[step]}</h1>
              <p className="text-sm text-balance text-muted-foreground">{subtitles[step]}</p>
            </div>

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

            {/* Where login-02 puts "Forgot your password?", a GitHub button and
                "Sign up". None of the three exist here: there is no reset flow,
                no OAuth, and accounts are created by a System Admin (UX-10b), so
                a sign-up link would be a lie. One honest line replaces them —
                on the credentials step only, since by the MFA steps you have
                already proven you have an account. */}
            {step === 'credentials' && (
              <p className="mt-6 text-center text-xs text-muted-foreground">
                {t('accountsNote')}
              </p>
            )}
          </div>
        </div>
      </main>

      {/* The brand panel. The artwork is 1.79:1 and this column is ~0.84:1, so
          object-cover can only ever show about 46% of the source width — and the
          skyline is in its left half while the wordmark is in its right, so the
          two cannot both survive the crop. The asset is therefore pre-cropped to
          the skyline at 1130×1340 (0.843, near-identical to the column), which
          also removes the baked wordmark for good at any panel shape; the name
          and slogan are drawn on top instead, so they stay sharp and can
          translate. */}
      <div
        className="relative hidden overflow-hidden lg:block"
        style={{ backgroundColor: BRAND_NAVY }}
      >
        <img
          src="/brand/riyadh-skyline.webp"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* The lockup sits over a night skyline whose road lights are bright
            enough to eat the slogan without this. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to top, rgba(4,10,49,0.94) 0%, rgba(4,10,49,0.72) 26%, rgba(4,10,49,0) 58%)',
          }}
        />
        <div className="relative flex h-full flex-col justify-end gap-3 p-10 pb-14">
          <span aria-hidden className="h-px w-full" style={{ backgroundColor: BRAND_GOLD }} />
          <BrandMark plate={false} decorative width={416} className="max-w-full" />
          {/* The panel carries the SLOGAN; the form column carries a functional
              prompt. They were briefly the same string, which printed the
              tagline twice on one screen — and wrapped it over two lines in the
              narrow form column, where it never belonged. */}
          <p className="max-w-sm text-sm text-white/85 italic">{t('slogan')}</p>
        </div>
      </div>
    </div>
  );
}
