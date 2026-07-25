'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  StaffUserListResponse,
  StaffUserResponse,
  StaffUserRole,
  StaffUserStatus,
} from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { dualDate, type Locale } from '@/lib/employee-format';
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

// Staff directory (UX-10b). The management view — System Admin CRUD, Company
// Admin read-only, per the matrix row "System config & staff users".
//
// The narrow `/staff-users/directory` endpoint is what Tasks and Audit use to
// turn an id into a name; this screen is the other half, and it is gated on
// `staff-user.read` so a Company Admin sees the roster while an HR Officer does
// not. Write controls are gated separately, so the read-only admin gets a
// directory rather than a set of buttons that 403.

const ROLES: readonly StaffUserRole[] = [
  'system_admin',
  'company_admin',
  'recruiter',
  'hr_officer',
  'gro_officer',
  'finance',
  'read_only',
];
const STATUSES: readonly StaffUserStatus[] = ['active', 'disabled'];

interface CreateForm {
  email: string;
  password: string;
  displayName: string;
  role: StaffUserRole;
}

const EMPTY: CreateForm = { email: '', password: '', displayName: '', role: 'hr_officer' };

export default function StaffUsersPage() {
  const t = useTranslations('staffUsers');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const canRead = useCan('staff-user.read');
  const canCreate = useCan('staff-user.create');
  const canUpdate = useCan('staff-user.update');

  const [users, setUsers] = useState<StaffUserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [editTarget, setEditTarget] = useState<StaffUserResponse | null>(null);
  const [editRole, setEditRole] = useState<StaffUserRole>('hr_officer');
  const [editStatus, setEditStatus] = useState<StaffUserStatus>('active');
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<StaffUserListResponse>('/staff-users');
      setUsers(res.users);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login');
        return;
      }
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setError(t('error'));
    } finally {
      setLoading(false);
    }
  }, [router, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await apiFetch('/staff-users', {
        method: 'POST',
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          role: form.role,
          ...(form.displayName ? { displayName: form.displayName } : {}),
        }),
      });
      setCreateOpen(false);
      setForm(EMPTY);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setFormError(t('saveError'));
    } finally {
      setSaving(false);
    }
  }

  function openEdit(u: StaffUserResponse) {
    setEditTarget(u);
    setEditRole(u.role);
    setEditStatus(u.status);
    setEditName(u.displayName ?? '');
    setEditError('');
  }

  async function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    setEditError('');
    try {
      await apiFetch(`/staff-users/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          role: editRole,
          status: editStatus,
          ...(editName ? { displayName: editName } : {}),
        }),
      });
      setEditTarget(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      // The server refuses self-demotion and self-disabling (UX-10b); that 400
      // belongs next to the control, not in the page banner.
      setEditError(t('saveError'));
    } finally {
      setSaving(false);
    }
  }

  if (forbidden || !canRead) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <NoAccess capability="staff-user.read" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        {canCreate && <Button onClick={() => setCreateOpen(true)}>{t('new')}</Button>}
      </div>

      {error && (
        <LoadError message={error} onRetry={() => void load()} hasContent={users.length > 0} />
      )}

      <DataTable
        rows={users}
        loading={loading}
        rowKey={(u) => u.id}
        searchPlaceholder={t('searchPlaceholder')}
        initialSort={{ key: 'name', dir: 'asc' }}
        emptyTitle={t('empty')}
        columns={[
          {
            key: 'name',
            header: t('colName'),
            sortValue: (u) => u.displayName ?? u.email,
            searchValues: (u) => [u.displayName, u.email],
            cell: (u) => <span className="font-medium">{u.displayName ?? '—'}</span>,
          },
          {
            key: 'email',
            header: t('colEmail'),
            sortValue: (u) => u.email,
            // Latin address inside an RTL page (UX-08).
            cell: (u) => (
              <bdi dir="ltr" className="inline-block text-start text-sm text-muted-foreground">
                {u.email}
              </bdi>
            ),
          },
          {
            key: 'role',
            header: t('colRole'),
            sortValue: (u) => u.role,
            cell: (u) => t(`role.${u.role}`),
          },
          {
            key: 'status',
            header: t('colStatus'),
            sortValue: (u) => u.status,
            cell: (u) => (
              <StatusPill tone={toneFor('user', u.status)}>{t(`status.${u.status}`)}</StatusPill>
            ),
          },
          {
            key: 'mfa',
            header: t('colMfa'),
            sortValue: (u) => String(u.mfaEnrolled),
            // Whether MFA is enrolled is operationally useful (admin roles are
            // required to enrol) and carries no secret.
            cell: (u) => (
              <span className="text-sm text-muted-foreground">
                {u.mfaEnrolled ? t('mfaOn') : t('mfaOff')}
              </span>
            ),
          },
          {
            key: 'created',
            header: t('colCreated'),
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
                    {t('edit')}
                  </Button>
                </div>
              )
            : undefined
        }
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('createTitle')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="su-name">{t('colName')}</Label>
              <Input
                id="su-name"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="su-email">{t('colEmail')}</Label>
              <Input
                id="su-email"
                type="email"
                dir="ltr"
                className="text-start"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="su-password">{t('initialPassword')}</Label>
              <Input
                id="su-password"
                type="password"
                dir="ltr"
                className="text-start"
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">{t('initialPasswordHint')}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t('colRole')}</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: (v as StaffUserRole) ?? 'hr_officer' })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{(v) => (v ? t(`role.${String(v)}`) : '')}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t(`role.${r}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? t('saving') : t('new')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editTarget !== null} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('editTitle')}</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <form onSubmit={submitEdit} className="space-y-4">
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <bdi dir="ltr" className="inline-block text-start">
                  {editTarget.email}
                </bdi>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="su-edit-name">{t('colName')}</Label>
                <Input
                  id="su-edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('colRole')}</Label>
                <Select
                  value={editRole}
                  onValueChange={(v) => setEditRole((v as StaffUserRole) ?? 'hr_officer')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => (v ? t(`role.${String(v)}`) : '')}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {t(`role.${r}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t('colStatus')}</Label>
                <Select
                  value={editStatus}
                  onValueChange={(v) => setEditStatus((v as StaffUserStatus) ?? 'active')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => (v ? t(`status.${String(v)}`) : '')}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((st) => (
                      <SelectItem key={st} value={st}>
                        {t(`status.${st}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editError && <p className="text-sm text-destructive">{editError}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                  {t('cancel')}
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? t('saving') : t('save')}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
