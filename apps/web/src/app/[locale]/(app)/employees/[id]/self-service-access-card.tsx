'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { EmployeeAccountResponse } from '@hr/contracts';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { toneFor } from '@/lib/status-tone';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';

type Loaded = { kind: 'none' } | { kind: 'account'; account: EmployeeAccountResponse };

// The refusals the SS-06a API can give, by its exact message, mapped to
// translated text. No screen shows raw API messages (they are English-only); an
// unrecognised one falls back to a translated generic line.
const REFUSALS: Record<string, string> = {
  'Employee self-service is not enabled for this company': 'refusal.notEnabled',
  'A terminated employee cannot be invited': 'refusal.terminated',
  'This employee already has an active account': 'refusal.alreadyActive',
  'This employee’s account is disabled — reactivate it instead': 'refusal.disabled',
  'Email already in use': 'refusal.emailInUse',
  'A terminated employee’s account cannot be reactivated': 'refusal.terminatedReactivate',
};

// "Self-service access" on the employee record (SS-06b) — staff management of the
// employee's own account (SS-06a API). Shown to `employee-user.read` holders
// (Company Admin, HR Officer); each action is gated by its own capability.
//
// The server decides every refusal — company not opted in, already active,
// address in use, terminated — and the card shows ITS message rather than
// re-deriving the rules here, where they would drift from the API's.
export function SelfServiceAccessCard({
  employeeId,
  terminated,
}: {
  employeeId: string;
  terminated: boolean;
}) {
  const t = useTranslations('selfServiceAccess');
  const canInvite = useCan('employee-user.invite');
  const canUpdate = useCan('employee-user.update');

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [dialogError, setDialogError] = useState('');

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const account = await apiFetch<EmployeeAccountResponse>(`/employee-accounts/${employeeId}`);
      setLoaded({ kind: 'account', account });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setLoaded({ kind: 'none' });
      else setLoadError(true);
    }
  }, [employeeId]);

  // Re-read when the record's termination state changes: terminating closes the
  // account on the server (SS-06a), and the card must not keep saying "active".
  useEffect(() => {
    void load();
  }, [load, terminated]);

  function openInvite() {
    setEmail(loaded?.kind === 'account' ? loaded.account.email : '');
    setDialogError('');
    setDialogOpen(true);
  }

  async function invite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setDialogError('');
    try {
      const account = await apiFetch<EmployeeAccountResponse>(
        `/employee-accounts/${employeeId}/invite`,
        { method: 'POST', body: JSON.stringify({ email }) },
      );
      setLoaded({ kind: 'account', account });
      setDialogOpen(false);
      setNotice(
        account.emailSent === false ? t('sendFailed') : t('sent', { email: account.email }),
      );
    } catch (err) {
      setDialogError(refusal(err));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: 'active' | 'disabled') {
    // Deactivating signs the employee out everywhere at once — worth a pause.
    if (status === 'disabled' && !window.confirm(t('confirmDeactivate'))) return;
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      const account = await apiFetch<EmployeeAccountResponse>(`/employee-accounts/${employeeId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setLoaded({ kind: 'account', account });
    } catch (err) {
      setActionError(refusal(err));
    } finally {
      setBusy(false);
    }
  }

  function refusal(err: unknown): string {
    const key = err instanceof ApiError ? REFUSALS[err.message] : undefined;
    if (key) return t(key);
    return err instanceof ApiError && err.status === 400
      ? t('refusal.invalidEmail')
      : t('genericError');
  }

  const account = loaded?.kind === 'account' ? loaded.account : null;
  const status = account?.status;

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{t('title')}</CardTitle>
        {loaded && (
          <CardAction className="flex flex-wrap gap-2">
            {canInvite && !terminated && (!account || status === 'invited') && (
              <Button variant="outline" size="sm" onClick={openInvite} disabled={busy}>
                {account ? t('resend') : t('invite')}
              </Button>
            )}
            {canUpdate && account && status !== 'disabled' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void setStatus('disabled')}
                disabled={busy}
              >
                {t('deactivate')}
              </Button>
            )}
            {canUpdate && account && status === 'disabled' && !terminated && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void setStatus('active')}
                disabled={busy}
              >
                {t('reactivate')}
              </Button>
            )}
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!loaded && !loadError && (
          <SkeletonRegion label={t('loading')}>
            <Skeleton className="h-4 w-48" />
          </SkeletonRegion>
        )}
        {loadError && <p className="text-sm text-destructive">{t('loadError')}</p>}
        {loaded?.kind === 'none' && (
          <p className="text-sm text-muted-foreground">
            {terminated ? t('noAccountTerminated') : t('noAccount')}
          </p>
        )}
        {account && (
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">{t('status')}</dt>
              <dd className="mt-1">
                <StatusPill tone={toneFor('user', account.status)}>
                  {t(`statusValue.${account.status}`)}
                </StatusPill>
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{t('email')}</dt>
              <dd className="mt-1 truncate text-sm">
                <bdi dir="ltr">{account.email}</bdi>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('password')}</dt>
              <dd className="mt-1 text-sm">
                {account.passwordSet ? t('passwordSet') : t('passwordNotSet')}
              </dd>
            </div>
          </dl>
        )}
        {notice && (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        )}
        {actionError && (
          <p role="alert" className="text-sm text-destructive">
            {actionError}
          </p>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={invite} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{account ? t('resendTitle') : t('inviteTitle')}</DialogTitle>
              <DialogDescription>{t('inviteDescription')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">{t('email')}</Label>
              <Input
                id="invite-email"
                type="email"
                dir="ltr"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {dialogError && (
              <p role="alert" className="text-sm text-destructive">
                {dialogError}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? t('sending') : account ? t('resend') : t('sendInvite')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
