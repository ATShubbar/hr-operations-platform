'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  ClientResponse,
  ClientUserListResponse,
  ClientUserResponse,
  ClientUserStatus,
} from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { toneFor } from '@/lib/status-tone';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { LoadError } from '@/components/ui/load-state';
import { StatusPill } from '@/components/ui/status-pill';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// A client's portal users, managed by STAFF (ROLE-02, ADR-013) over
// `/clients/:clientId/users`. The company comes from the row the dialog was
// opened on — the API takes it from the PATH and refuses non-staff, so this
// cannot be pointed at a company by a client representative.
//
// Deliberately small: the client record screen is rebuilt in DS-05+, and this
// block moves there rather than being redesigned twice. Its wording lives in
// `portal.users.*` — the client-side screen that used it was retired in ROLE-03.

const STATUSES: readonly ClientUserStatus[] = ['active', 'disabled'];

type View =
  | { kind: 'list' }
  | { kind: 'invite' }
  | { kind: 'edit'; user: ClientUserResponse; status: ClientUserStatus };

// One client role since ADR-013 (Client manager), so an invitation carries no
// role and an edit changes status only.
interface InviteForm {
  email: string;
  password: string;
}
const EMPTY_INVITE: InviteForm = { email: '', password: '' };

export function PortalUsersDialog({
  client,
  onClose,
}: {
  client: ClientResponse | null;
  onClose: () => void;
}) {
  const t = useTranslations('clients');
  const tu = useTranslations('portal.users');
  const locale = useLocale();
  const router = useRouter();
  const canCreate = useCan('client-user.create');
  const canUpdate = useCan('client-user.update');

  const [users, setUsers] = useState<ClientUserResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>({ kind: 'list' });
  const [invite, setInvite] = useState<InviteForm>(EMPTY_INVITE);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const clientId = client?.id ?? null;

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<ClientUserListResponse>(`/clients/${clientId}/users`);
      setUsers(res.users);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(tu('error'));
    } finally {
      setLoading(false);
    }
  }, [clientId, router, tu]);

  // Each opening starts from the list, with a fresh fetch — never the previous
  // company's rows for a frame.
  useEffect(() => {
    setUsers([]);
    setView({ kind: 'list' });
    setFormError('');
    void load();
  }, [load]);

  async function submitInvite(e: FormEvent) {
    e.preventDefault();
    if (!clientId) return;
    setSaving(true);
    setFormError('');
    try {
      await apiFetch(`/clients/${clientId}/users`, {
        method: 'POST',
        body: JSON.stringify(invite),
      });
      setInvite(EMPTY_INVITE);
      setView({ kind: 'list' });
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setFormError(tu('saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (!clientId || view.kind !== 'edit') return;
    setSaving(true);
    setFormError('');
    try {
      await apiFetch(`/clients/${clientId}/users/${view.user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: view.status }),
      });
      setView({ kind: 'list' });
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setFormError(tu('saveError'));
    } finally {
      setSaving(false);
    }
  }

  const companyName = client ? (locale === 'ar' ? client.name.ar : client.name.en) : '';
  const back = () => {
    setFormError('');
    setView({ kind: 'list' });
  };

  return (
    <Dialog open={client !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {view.kind === 'invite'
              ? tu('inviteTitle')
              : view.kind === 'edit'
                ? tu('editTitle')
                : t('portalUsersTitle', { name: companyName })}
          </DialogTitle>
          {view.kind === 'list' && (
            <DialogDescription>{t('portalUsersHint', { name: companyName })}</DialogDescription>
          )}
        </DialogHeader>

        {view.kind === 'list' && (
          <div className="space-y-4">
            {error && (
              <LoadError
                message={error}
                onRetry={() => void load()}
                hasContent={users.length > 0}
              />
            )}
            <DataTable
              rows={users}
              loading={loading}
              rowKey={(u) => u.id}
              searchPlaceholder={tu('searchPlaceholder')}
              initialSort={{ key: 'email', dir: 'asc' }}
              emptyTitle={tu('empty')}
              columns={[
                {
                  key: 'email',
                  header: tu('colEmail'),
                  sortValue: (u) => u.email,
                  searchValues: (u) => [u.email],
                  cell: (u) => (
                    <bdi dir="ltr" className="inline-block text-start font-medium">
                      {u.email}
                    </bdi>
                  ),
                },
                {
                  key: 'status',
                  header: tu('colStatus'),
                  sortValue: (u) => u.status,
                  cell: (u) => (
                    <StatusPill tone={toneFor('user', u.status)}>
                      {tu(`status.${u.status}`)}
                    </StatusPill>
                  ),
                },
              ]}
              actions={
                canUpdate
                  ? (u) => (
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setFormError('');
                            setView({ kind: 'edit', user: u, status: u.status });
                          }}
                        >
                          {tu('edit')}
                        </Button>
                      </div>
                    )
                  : undefined
              }
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {t('close')}
              </Button>
              {canCreate && (
                <Button
                  type="button"
                  onClick={() => {
                    setInvite(EMPTY_INVITE);
                    setFormError('');
                    setView({ kind: 'invite' });
                  }}
                >
                  {tu('invite')}
                </Button>
              )}
            </DialogFooter>
          </div>
        )}

        {view.kind === 'invite' && (
          <form onSubmit={submitInvite} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="spu-email">{tu('colEmail')}</Label>
              <Input
                id="spu-email"
                type="email"
                dir="ltr"
                className="text-start"
                value={invite.email}
                onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="spu-password">{tu('initialPassword')}</Label>
              <Input
                id="spu-password"
                type="password"
                dir="ltr"
                className="text-start"
                minLength={8}
                value={invite.password}
                onChange={(e) => setInvite({ ...invite, password: e.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">{tu('initialPasswordHint')}</p>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={back}>
                {tu('cancel')}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? tu('saving') : tu('invite')}
              </Button>
            </DialogFooter>
          </form>
        )}

        {view.kind === 'edit' && (
          <form onSubmit={submitEdit} className="space-y-4">
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <bdi dir="ltr" className="inline-block text-start">
                {view.user.email}
              </bdi>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="spu-edit-status">{tu('colStatus')}</Label>
              <Select
                value={view.status}
                onValueChange={(v) =>
                  setView({ ...view, status: (v as ClientUserStatus) ?? 'active' })
                }
              >
                <SelectTrigger id="spu-edit-status" className="w-full">
                  <SelectValue>{(v) => (v ? tu(`status.${String(v)}`) : '')}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {tu(`status.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Disabling ends their open sessions at once (SS-06a) — say so,
                  since it is not undone by setting them active again. */}
              <p className="text-xs text-muted-foreground">{t('portalUsersDisableHint')}</p>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={back}>
                {tu('cancel')}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? tu('saving') : tu('save')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
