'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, ChevronDown, Ellipsis } from 'lucide-react';
import type { StaffUserResponse, StaffUserRole } from '@hr/contracts';
import { matchesAnyField } from '@hr/text';
import { Link, useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { toneFor } from '@/lib/status-tone';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusPill } from '@/components/ui/status-pill';
import { TABLE_CELL, TABLE_FRAME, TABLE_HEAD, TABLE_ROW } from '@/components/ui/table';
import { toastError, toastSuccess } from '@/components/ui/toast';

// The Accounts block of Roles and permissions (DS-19) — STAFF accounts (owner
// decision): search, role and status filters, and per row the prototype's role
// menu and ⋯ menu. Client manager and employee accounts are managed where their
// rules live (Clients → Portal users, the person's record), and the note says so.
//
// What the prototype has that this does not: "Resend invitation" (staff accounts
// are created with an initial password, not invited) and "Remove user" — accounts
// are deactivated, never deleted, because sessions and the audit trail point at
// them (UX-10b). Deactivating ends the account's sessions (SS-06a).
//
// The server refuses a change to your OWN role or status (UX-10b); those controls
// are disabled on your own row, with the reason as their title.

export const STAFF_ROLES: readonly StaffUserRole[] = [
  'administrator',
  'hr_officer',
  'gro_officer',
  'auditor',
];
const ALL = 'all';

export function AccountsTable({
  users,
  canUpdate,
  onChanged,
  onRename,
}: {
  users: readonly StaffUserResponse[];
  canUpdate: boolean;
  onChanged: () => Promise<void> | void;
  onRename: (u: StaffUserResponse) => void;
}) {
  const t = useTranslations('staffUsers');
  const tr = useTranslations('roles');
  const locale = useLocale();
  const me = useSession().userId;
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [busy, setBusy] = useState<string | null>(null);
  const [roleOpen, setRoleOpen] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const router = useRouter();
  const rows = users
    .filter((u) => role === ALL || u.role === role)
    .filter((u) => status === ALL || u.status === status)
    .filter((u) => matchesAnyField([u.displayName ?? '', u.email], search))
    .sort((a, b) => (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email, locale));

  const nameOf = (u: StaffUserResponse) => u.displayName ?? u.email;
  const joined = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));

  async function patch(u: StaffUserResponse, body: object, done: string) {
    setBusy(u.id);
    try {
      await apiFetch(`/staff-users/${u.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      await onChanged();
      toastSuccess(done);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      toastError(t('actionError'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="h-8 w-full text-sm sm:w-[280px]"
        />
        <Select value={role} onValueChange={(v) => setRole(v ?? ALL)}>
          <SelectTrigger size="sm" className="w-full sm:w-[200px]" aria-label={t('colRole')}>
            <SelectValue>{(v) => (v === ALL ? t('allRoles') : tr(String(v)))}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('allRoles')}</SelectItem>
            {STAFF_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {tr(r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v ?? ALL)}>
          <SelectTrigger size="sm" className="w-full sm:w-[200px]" aria-label={t('colStatus')}>
            <SelectValue>
              {(v) => (v === ALL ? t('allStatuses') : t(`status.${String(v)}`))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('allStatuses')}</SelectItem>
            <SelectItem value="active">{t('status.active')}</SelectItem>
            <SelectItem value="disabled">{t('status.disabled')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className={TABLE_FRAME} role="region" aria-label={t('accounts')} tabIndex={0}>
        <table className="w-full min-w-[860px] text-start">
          <thead>
            <tr>
              <th scope="col" className={TABLE_HEAD}>
                {t('colUser')}
              </th>
              <th scope="col" className={TABLE_HEAD}>
                {t('colOrg')}
              </th>
              <th scope="col" className={TABLE_HEAD}>
                {t('colRole')}
              </th>
              <th scope="col" className={TABLE_HEAD}>
                {t('colStatus')}
              </th>
              <th scope="col" className={TABLE_HEAD}>
                {t('colJoined')}
              </th>
              <th scope="col" className={cn(TABLE_HEAD, 'w-12')}>
                <span className="sr-only">{t('actionsCol')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[13px] text-neutral-400">
                  {t('noMatch')}
                </td>
              </tr>
            ) : (
              rows.map((u) => {
                const self = u.id === me;
                const locked = !canUpdate || self || busy === u.id;
                return (
                  <tr key={u.id} className={TABLE_ROW}>
                    <td className={cn(TABLE_CELL, 'h-14')}>
                      <span className="flex items-center gap-2.5">
                        <Avatar name={u.displayName ?? u.email} size="sm" />
                        <span className="flex min-w-0 flex-col">
                          <span className="font-medium">{u.displayName ?? '—'}</span>
                          <bdi dir="ltr" className="text-start text-xs text-muted-foreground">
                            {u.email}
                          </bdi>
                        </span>
                      </span>
                    </td>
                    <td className={cn(TABLE_CELL, 'text-muted-foreground')}>{t('orgName')}</td>
                    <td className={TABLE_CELL}>
                      {canUpdate ? (
                        <Popover
                          open={roleOpen === u.id}
                          onOpenChange={(o) => setRoleOpen(o ? u.id : null)}
                        >
                          <PopoverTrigger
                            render={
                              <button
                                type="button"
                                disabled={locked}
                                title={self ? t('self') : undefined}
                                aria-label={t('changeRoleFor', { name: nameOf(u) })}
                                className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 hover:bg-neutral-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent"
                              />
                            }
                          >
                            {tr(u.role)}
                            {!self && (
                              <ChevronDown className="size-3 text-neutral-400" aria-hidden />
                            )}
                          </PopoverTrigger>
                          <PopoverContent className="w-[264px] p-1">
                            <p className="px-2.5 pt-1.5 pb-1 text-[11px] leading-4 font-medium text-muted-foreground">
                              {t('changeRole')}
                            </p>
                            <ul className="flex flex-col">
                              {STAFF_ROLES.map((r) => {
                                const on = r === u.role;
                                return (
                                  <li key={r}>
                                    <button
                                      type="button"
                                      aria-pressed={on}
                                      onClick={() => {
                                        setRoleOpen(null);
                                        if (!on)
                                          void patch(
                                            u,
                                            { role: r },
                                            t('roleChanged', { name: nameOf(u), role: tr(r) }),
                                          );
                                      }}
                                      className={cn(
                                        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-start hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
                                        on && 'bg-neutral-100',
                                      )}
                                    >
                                      <span className="flex min-w-0 grow flex-col gap-px">
                                        <span className="text-[13px] leading-[17px] font-medium">
                                          {tr(r)}
                                        </span>
                                        <span className="text-[11px] leading-[15px] text-muted-foreground">
                                          {t(`note.${r}`)}
                                        </span>
                                      </span>
                                      {on && <Check className="size-3.5 shrink-0" aria-hidden />}
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          </PopoverContent>
                        </Popover>
                      ) : (
                        tr(u.role)
                      )}
                    </td>
                    <td className={TABLE_CELL}>
                      <span className="flex flex-col items-start gap-0.5">
                        <StatusPill tone={toneFor('user', u.status)}>
                          {t(`status.${u.status}`)}
                        </StatusPill>
                        <span className="text-[11px] leading-4 text-muted-foreground">
                          {u.mfaEnrolled ? t('mfaOn') : t('mfaOff')}
                        </span>
                      </span>
                    </td>
                    <td className={cn(TABLE_CELL, 'text-muted-foreground')}>
                      {joined(u.createdAt)}
                    </td>
                    <td className={cn(TABLE_CELL, 'px-2')}>
                      {canUpdate && (
                        <Popover
                          open={menuOpen === u.id}
                          onOpenChange={(o) => setMenuOpen(o ? u.id : null)}
                        >
                          <PopoverTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={busy === u.id}
                                aria-label={t('rowMenu', { name: nameOf(u) })}
                              />
                            }
                          >
                            <Ellipsis />
                          </PopoverTrigger>
                          <PopoverContent className="w-52 p-1">
                            <ul className="flex flex-col">
                              <li>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMenuOpen(null);
                                    onRename(u);
                                  }}
                                  className="w-full rounded-md px-2.5 py-1.5 text-start text-[13px] leading-[18px] hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                                >
                                  {t('rename')}
                                </button>
                              </li>
                              <li>
                                <button
                                  type="button"
                                  disabled={self}
                                  title={self ? t('self') : undefined}
                                  onClick={() => {
                                    setMenuOpen(null);
                                    const off = u.status === 'active';
                                    void patch(
                                      u,
                                      { status: off ? 'disabled' : 'active' },
                                      t(off ? 'deactivated' : 'reactivated', { name: nameOf(u) }),
                                    );
                                  }}
                                  className={cn(
                                    'w-full rounded-md px-2.5 py-1.5 text-start text-[13px] leading-[18px] hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:cursor-not-allowed disabled:text-neutral-400 disabled:hover:bg-transparent',
                                    u.status === 'active' && !self && 'text-destructive',
                                  )}
                                >
                                  {u.status === 'active' ? t('deactivate') : t('reactivate')}
                                </button>
                              </li>
                            </ul>
                          </PopoverContent>
                        </Popover>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-4 text-muted-foreground">
        {t.rich('othersNote', {
          clients: (c) => (
            <Link href="/clients" className="underline underline-offset-2 hover:text-foreground">
              {c}
            </Link>
          ),
          people: (c) => (
            <Link href="/employees" className="underline underline-offset-2 hover:text-foreground">
              {c}
            </Link>
          ),
        })}
      </p>
    </div>
  );
}
