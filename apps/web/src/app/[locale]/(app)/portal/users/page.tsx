'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type {
  ClientUserListResponse,
  ClientUserResponse,
  ClientUserRole,
  ClientUserStatus,
} from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { dualDate, type Locale } from '@/lib/employee-format';
import { useLocale } from 'next-intl';
import { toneFor } from '@/lib/status-tone';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { LoadError, NoAccess } from '@/components/ui/load-state';
import { StatusPill } from '@/components/ui/status-pill';
import {
  Dialog,
  DialogContent,
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

// Client portal user management (UX-10a) over the CLIENT-03 API.
//
// The API, its permissions and its e2e coverage have existed since CLIENT-03 —
// list, invite, update, deactivate, all scoped to the caller's OWN client by the
// request context rather than by anything the client sends. What was missing was
// any way to reach it from the product: a Client Admin held `client-user.*` and
// had no button.
//
// Client-scoped by construction: the endpoints take no clientId, so this screen
// cannot address another company's users even if it tried. Staff never hold
// `client-user.*` (the matrix gives it to Client Admin alone), so a staff member
// who deep-links here gets the refusal state rather than an empty table.

const ROLES: readonly ClientUserRole[] = ['client_admin', 'client_user'];
const STATUSES: readonly ClientUserStatus[] = ['active', 'disabled'];

interface InviteForm {
  email: string;
  password: string;
  role: ClientUserRole;
}

const EMPTY_INVITE: InviteForm = { email: '', password: '', role: 'client_user' };

export default function PortalUsersPage() {
  const t = useTranslations('portal');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const canRead = useCan('client-user.read');
  const canCreate = useCan('client-user.create');
  const canUpdate = useCan('client-user.update');

  const [users, setUsers] = useState<ClientUserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState<InviteForm>(EMPTY_INVITE);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [editTarget, setEditTarget] = useState<ClientUserResponse | null>(null);
  const [editRole, setEditRole] = useState<ClientUserRole>('client_user');
  const [editStatus, setEditStatus] = useState<ClientUserStatus>('active');
  const [editError, setEditError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<ClientUserListResponse>('/client-users');
      setUsers(res.users);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login');
        return;
      }
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setError(t('users.error'));
    } finally {
      setLoading(false);
    }
  }, [router, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitInvite(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await apiFetch('/client-users', { method: 'POST', body: JSON.stringify(invite) });
      setInviteOpen(false);
      setInvite(EMPTY_INVITE);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setFormError(t('users.saveError'));
    } finally {
      setSaving(false);
    }
  }

  function openEdit(u: ClientUserResponse) {
    setEditTarget(u);
    setEditRole(u.role);
    setEditStatus(u.status);
    setEditError('');
  }

  async function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    setEditError('');
    try {
      await apiFetch(`/client-users/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: editRole, status: editStatus }),
      });
      setEditTarget(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setEditError(t('users.saveError'));
    } finally {
      setSaving(false);
    }
  }

  if (forbidden || !canRead) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('users.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('users.subtitle')}</p>
        </div>
        <NoAccess capability="client-user.read" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('users.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('users.subtitle')}</p>
        </div>
        {canCreate && <Button onClick={() => setInviteOpen(true)}>{t('users.invite')}</Button>}
      </div>

      {error && (
        <LoadError message={error} onRetry={() => void load()} hasContent={users.length > 0} />
      )}

      <DataTable
        rows={users}
        loading={loading}
        rowKey={(u) => u.id}
        searchPlaceholder={t('users.searchPlaceholder')}
        initialSort={{ key: 'email', dir: 'asc' }}
        emptyTitle={t('users.empty')}
        columns={[
          {
            key: 'email',
            header: t('users.colEmail'),
            sortValue: (u) => u.email,
            searchValues: (u) => [u.email],
            // An email is a Latin string in an Arabic page — isolated so the
            // surrounding direction cannot reorder it (UX-08).
            cell: (u) => (
              <bdi dir="ltr" className="inline-block text-start font-medium">
                {u.email}
              </bdi>
            ),
          },
          {
            key: 'role',
            header: t('users.colRole'),
            sortValue: (u) => u.role,
            cell: (u) => t(`users.role.${u.role}`),
          },
          {
            key: 'status',
            header: t('users.colStatus'),
            sortValue: (u) => u.status,
            cell: (u) => (
              <StatusPill tone={toneFor('user', u.status)}>
                {t(`users.status.${u.status}`)}
              </StatusPill>
            ),
          },
          {
            key: 'createdAt',
            header: t('users.colCreated'),
            sortValue: (u) => u.createdAt,
            cell: (u) => (
              <span className="whitespace-nowrap text-sm text-muted-foreground">
                {dualDate(u.createdAt, locale)}
              </span>
            ),
          },
        ]}
        actions={
          canUpdate
            ? (u) => (
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => openEdit(u)}>
                    {t('users.edit')}
                  </Button>
                </div>
              )
            : undefined
        }
      />

      {/* Invite */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('users.inviteTitle')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitInvite} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cu-email">{t('users.colEmail')}</Label>
              <Input
                id="cu-email"
                type="email"
                dir="ltr"
                className="text-start"
                value={invite.email}
                onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cu-password">{t('users.initialPassword')}</Label>
              <Input
                id="cu-password"
                type="password"
                dir="ltr"
                className="text-start"
                minLength={8}
                value={invite.password}
                onChange={(e) => setInvite({ ...invite, password: e.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">{t('users.initialPasswordHint')}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t('users.colRole')}</Label>
              <Select
                value={invite.role}
                onValueChange={(v) => setInvite({ ...invite, role: (v as ClientUserRole) ?? 'client_user' })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{(v) => (v ? t(`users.role.${String(v)}`) : '')}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t(`users.role.${r}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                {t('users.cancel')}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? t('users.saving') : t('users.invite')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit role / status */}
      <Dialog open={editTarget !== null} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('users.editTitle')}</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <form onSubmit={submitEdit} className="space-y-4">
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <bdi dir="ltr" className="inline-block text-start">
                  {editTarget.email}
                </bdi>
              </div>
              <div className="space-y-1.5">
                <Label>{t('users.colRole')}</Label>
                <Select
                  value={editRole}
                  onValueChange={(v) => setEditRole((v as ClientUserRole) ?? 'client_user')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => (v ? t(`users.role.${String(v)}`) : '')}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {t(`users.role.${r}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t('users.colStatus')}</Label>
                <Select
                  value={editStatus}
                  onValueChange={(v) => setEditStatus((v as ClientUserStatus) ?? 'active')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => (v ? t(`users.status.${String(v)}`) : '')}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`users.status.${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editError && <p className="text-sm text-destructive">{editError}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                  {t('users.cancel')}
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? t('users.saving') : t('users.save')}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
