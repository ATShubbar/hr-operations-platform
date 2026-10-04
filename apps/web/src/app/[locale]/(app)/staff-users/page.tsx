'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Ellipsis } from 'lucide-react';
import type {
  RoleListResponse,
  StaffUserListResponse,
  StaffUserResponse,
  StaffUserRole,
} from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadError, NoAccess } from '@/components/ui/load-state';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import { toastSuccess } from '@/components/ui/toast';
import { AccountsTable, STAFF_ROLES } from './accounts-table';
import { HIDDEN_RESOURCES, PermissionMatrix, resourcesOf } from './permission-matrix';

// Roles and permissions (DS-19) — the prototype's screen (ADR-012), replacing
// UX-10b's staff directory at the same URL. Administrator manages, Auditor reads
// (staff-user.read); everyone else gets the 403 state.
//
// The roles and the matrix come from GET /roles, which is the API's own
// ROLE_PERMISSIONS — no second copy here to drift. Editing roles (Add / Edit /
// Delete role, toggling a square) is shown and marked "coming soon": the owner
// put editable roles LAST, with safeguards. The accounts below are staff
// accounts (owner decision); client and employee accounts are managed where
// their rules live, and the note links there.

// The four actions the role cards count, as the prototype does. `write` is the
// config resource's name for update.
const COUNTED = [
  { key: 'read', actions: ['read'] },
  { key: 'update', actions: ['update', 'write'] },
  { key: 'create', actions: ['create'] },
  { key: 'delete', actions: ['delete'] },
] as const;

interface CreateForm {
  email: string;
  password: string;
  displayName: string;
  role: StaffUserRole;
}
const EMPTY: CreateForm = { email: '', password: '', displayName: '', role: 'hr_officer' };

const shown = (permission: string) => !HIDDEN_RESOURCES.has(permission.split('.')[0] ?? '');

export default function RolesAndPermissionsPage() {
  const t = useTranslations('staffUsers');
  const tr = useTranslations('roles');
  const ts = useTranslations('states');
  const router = useRouter();
  const canRead = useCan('staff-user.read');
  const canCreate = useCan('staff-user.create');
  const canUpdate = useCan('staff-user.update');

  const [roles, setRoles] = useState<RoleListResponse | null>(null);
  const [users, setUsers] = useState<StaffUserResponse[]>([]);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [renameTarget, setRenameTarget] = useState<StaffUserResponse | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [r, u] = await Promise.all([
        apiFetch<RoleListResponse>('/roles'),
        apiFetch<StaffUserListResponse>('/staff-users'),
      ]);
      setRoles(r);
      setUsers(u.users);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setError(t('error'));
    }
  }, [router, t]);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

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

  async function submitRename(e: FormEvent) {
    e.preventDefault();
    if (!renameTarget || !renameValue.trim()) return;
    setSaving(true);
    setFormError('');
    try {
      await apiFetch(`/staff-users/${renameTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ displayName: renameValue.trim() }),
      });
      setRenameTarget(null);
      await load();
      toastSuccess(t('renamed'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setFormError(t('actionError'));
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
    </div>
  );

  if (forbidden || !canRead) {
    return (
      <div className="flex max-w-[1360px] flex-col gap-4">
        {header}
        <NoAccess capability="staff-user.read" />
      </div>
    );
  }

  if (!roles) {
    return (
      <div className="flex max-w-[1360px] flex-col gap-4">
        {header}
        {error ? (
          <LoadError message={error} onRetry={() => void load()} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-[132px] rounded-xl" />
            ))}
          </div>
        )}
      </div>
    );
  }

  const resources = resourcesOf(roles.permissions);
  const grantedOf = (perms: readonly string[]) => perms.filter(shown).length;
  const countOf = (perms: readonly string[], actions: readonly string[]) =>
    perms.filter((p) => shown(p) && actions.includes(p.split('.')[1] ?? '')).length;
  const totalGranted = roles.roles.reduce((n, r) => n + grantedOf(r.permissions), 0);
  const disabled = users.filter((u) => u.status === 'disabled').length;

  const soonItem = (label: string) => (
    <li>
      <button
        type="button"
        disabled
        className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-start text-[13px] leading-[18px] text-neutral-400"
      >
        {label}
        <span className="text-[11px]">{ts('soon')}</span>
      </button>
    </li>
  );

  return (
    <div className="flex max-w-[1360px] flex-col gap-4">
      {header}

      {error && <LoadError message={error} onRetry={() => void load()} hasContent />}

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {roles.roles.map((r) => (
          <li
            key={r.id}
            className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
          >
            <div className="flex items-start gap-2">
              <span className="flex min-w-0 grow flex-col gap-0.5">
                <span className="font-heading text-lg leading-6 font-semibold">{tr(r.id)}</span>
                <span className="text-[13px] leading-[18px] text-muted-foreground">
                  {t('accountsCount', { count: r.accounts })} · {t(`note.${r.id}`)}
                </span>
              </span>
              <Popover open={menu === r.id} onOpenChange={(o) => setMenu(o ? r.id : null)}>
                <PopoverTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('roleMenu', { role: tr(r.id) })}
                    />
                  }
                >
                  <Ellipsis />
                </PopoverTrigger>
                <PopoverContent className="w-56 p-1">
                  <ul className="flex flex-col">
                    {soonItem(t('editRole'))}
                    {soonItem(t('deleteRole'))}
                  </ul>
                  <p className="px-2.5 pt-1 pb-1.5 text-[11px] leading-4 text-muted-foreground">
                    {t('editingSoon')}
                  </p>
                </PopoverContent>
              </Popover>
            </div>
            <dl className="grid grid-cols-5 gap-2 border-t pt-3">
              {COUNTED.map((c) => (
                <div key={c.key} className="flex flex-col gap-px">
                  <dd className="order-1 font-mono text-[15px] leading-5 font-medium">
                    {countOf(r.permissions, c.actions)}
                  </dd>
                  <dt className="order-2 text-[11px] leading-4 text-muted-foreground">
                    {t(`count.${c.key}`)}
                  </dt>
                </div>
              ))}
              <div className="flex flex-col gap-px">
                <dd className="order-1 font-mono text-[15px] leading-5 font-medium">
                  {grantedOf(r.permissions)}
                </dd>
                <dt className="order-2 text-[11px] leading-4 text-muted-foreground">
                  {t('granted')}
                </dt>
              </div>
            </dl>
          </li>
        ))}
        <li className="flex flex-col items-start justify-center gap-2 rounded-xl border border-dashed border-neutral-300 p-4">
          <span className="text-[15px] leading-5 font-medium">{t('addRole')}</span>
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {t('addRoleHint')}
          </span>
          <Button variant="outline" size="sm" disabled aria-describedby="rp-add-soon">
            {t('addRole')}
            <span id="rp-add-soon" className="text-[11px] font-normal text-muted-foreground">
              {ts('soon')}
            </span>
          </Button>
        </li>
      </ul>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label={t('tile.roles')} value={roles.roles.length} />
        <StatTile label={t('tile.resources')} value={resources.length} />
        <StatTile label={t('tile.granted')} value={totalGranted} />
      </div>

      <PermissionMatrix permissions={roles.permissions} roles={roles.roles} />

      <section aria-labelledby="rp-accounts" className="flex flex-col gap-3 pt-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
          <div className="flex min-w-0 grow flex-col gap-0.5">
            <h2 id="rp-accounts" className="text-base leading-6 font-medium">
              {t('accounts')}
            </h2>
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              {t('accountsSummary', { total: users.length, disabled })}
            </p>
          </div>
          {canCreate && (
            <Button
              size="sm"
              className="self-start sm:self-auto"
              onClick={() => {
                setForm(EMPTY);
                setFormError('');
                setCreateOpen(true);
              }}
            >
              {t('addUser')}
            </Button>
          )}
        </div>
        <AccountsTable
          users={users}
          canUpdate={canUpdate}
          onChanged={load}
          onRename={(u) => {
            setRenameTarget(u);
            setRenameValue(u.displayName ?? '');
            setFormError('');
          }}
        />
      </section>

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
              <Label htmlFor="su-role">{t('colRole')}</Label>
              <Select
                value={form.role}
                onValueChange={(v) =>
                  setForm({ ...form, role: (v as StaffUserRole) ?? 'hr_officer' })
                }
              >
                <SelectTrigger id="su-role" className="w-full">
                  <SelectValue>{(v) => (v ? tr(String(v)) : '')}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STAFF_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {tr(r)}
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
                {saving ? t('saving') : t('addUser')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={renameTarget !== null} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('renameTitle')}</DialogTitle>
          </DialogHeader>
          {renameTarget && (
            <form onSubmit={submitRename} className="space-y-4">
              <bdi dir="ltr" className="block text-start text-sm text-muted-foreground">
                {renameTarget.email}
              </bdi>
              <div className="space-y-1.5">
                <Label htmlFor="su-rename">{t('colName')}</Label>
                <Input
                  id="su-rename"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  required
                />
              </div>
              {formError && <p className="text-sm text-destructive">{formError}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRenameTarget(null)}>
                  {t('cancel')}
                </Button>
                <Button type="submit" disabled={saving || !renameValue.trim()}>
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
