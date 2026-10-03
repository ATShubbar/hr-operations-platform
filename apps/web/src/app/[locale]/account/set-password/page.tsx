'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { AuthFrame } from '@/components/auth-frame';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MIN_LENGTH = 10; // the API's rule (setPasswordRequestSchema)

// The token is stripped from the address bar on arrival — but the language
// switcher (and a reload) navigate to this same page, which would then have no
// token: measured, the switcher linked to `/ar/account/set-password` with the
// token already gone. So it is also kept for THIS TAB in sessionStorage (not
// localStorage: it must not outlive the tab or reach another one) and removed
// the moment it is used or refused.
const TOKEN_KEY = 'hr.set-password-token';

function readStored(): string {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return ''; // storage blocked — the link from the email still works
  }
}
function store(token: string | null) {
  try {
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
    else window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage blocked — nothing to clean up
  }
}

type State = 'reading' | 'form' | 'done' | 'invalid';

// Where the invitation and reset emails land (SS-06b). The link is
// `/{lang}/account/set-password#token=…` — the token in the FRAGMENT, which no
// browser sends to a server. On arrival the page takes it and immediately
// removes it from the address bar, so it is not left in history, bookmarks, a
// shared screenshot or a synced tab. One page for both purposes: the API decides
// what the token is for.
export default function SetPasswordPage() {
  const t = useTranslations('account');
  const [state, setState] = useState<State>('reading');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
    // Strip it from the URL (and so from history) whether or not it is valid.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (fromLink) store(fromLink);
    const raw = fromLink || readStored();
    setToken(raw);
    setState(raw ? 'form' : 'invalid');
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_LENGTH) return setFieldError(t('tooShort', { min: MIN_LENGTH }));
    if (password !== confirm) return setFieldError(t('mismatch'));
    setFieldError('');
    setBusy(true);
    try {
      await apiFetch('/auth/account/set-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setState('done');
      setToken('');
      store(null);
    } catch {
      // The API answers every unusable link the same way; so does the page.
      setState('invalid');
      store(null);
    } finally {
      setBusy(false);
    }
  }

  if (state === 'done') {
    return (
      <AuthFrame title={t('doneTitle')} subtitle={t('doneSubtitle')}>
        <Link href="/login" className={cn(buttonVariants(), 'w-full')}>
          {t('signIn')}
        </Link>
      </AuthFrame>
    );
  }

  if (state === 'invalid') {
    return (
      <AuthFrame title={t('invalidTitle')} subtitle={t('invalidSubtitle')}>
        <Link
          href="/account/forgot-password"
          className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
        >
          {t('requestNewLink')}
        </Link>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title={t('setTitle')} subtitle={t('setSubtitle', { min: MIN_LENGTH })}>
      {state === 'form' && (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">{t('newPassword')}</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? 'password-error' : undefined}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">{t('confirmPassword')}</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? 'password-error' : undefined}
              required
            />
          </div>
          {fieldError && (
            <p id="password-error" role="alert" className="text-sm text-destructive">
              {fieldError}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? t('saving') : t('save')}
          </Button>
        </form>
      )}
    </AuthFrame>
  );
}
