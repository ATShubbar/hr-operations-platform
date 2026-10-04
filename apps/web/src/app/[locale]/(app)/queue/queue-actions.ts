'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { GroProcessResponse, RequestResponse, TaskResponse } from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { toastSuccess } from '@/components/ui/toast';

// One queue item, whichever kind it is (DS-12), and the actions on it — shared
// by the row and the work-item dialog (DS-13), so the two can't disagree about
// who may do what.
//
// - Assign: procedures (gro.process), tasks (task.update) and — REQ-05 —
//   APPROVED requests (request.process; in progress or info needed), through
//   their own route (POST /requests/:id/assign), only to the roles that work on
//   requests. Never to nobody. Every kind offers only ASSIGNEE_ROLES (ASSIGN-01).
// - Snooze (owner decision, DS-12): moves the REAL due date seven days later,
//   through each kind's own update — audited, never a view-only hide.

export type QueueKind = 'procedure' | 'request' | 'task';

export interface QueueItem {
  kind: QueueKind;
  id: string;
  title: string;
  ref: string | null;
  meta: string;
  clientId: string | null;
  clientName: string | null;
  /** The employee a procedure is for, or whoever raised a request. */
  person: { name: string; ar: string | null } | null;
  due: string | null;
  /** When the item was opened — the tie-break between equal due dates. */
  createdAt: string;
  /** When it finished — the last update (DS-22b); null for open work. */
  finishedAt: string | null;
  assigneeUserId: string | null;
  /** Where the item lives outside the queue (the person, the request), if anywhere. */
  recordHref: string | null;
  gro?: GroProcessResponse;
  request?: RequestResponse;
  task?: TaskResponse;
  searchText: string[];
}

// Who work can be handed to — the roles that work it: request.process,
// task.update and gro.process are held by exactly these three today (REQ-05,
// ASSIGN-01). The server checks each kind's own permission and refuses anyone
// else; this only keeps the picker from offering people it would refuse.
export const ASSIGNEE_ROLES: ReadonlySet<string> = new Set([
  'administrator',
  'hr_officer',
  'gro_officer',
]);

const ENDPOINT: Record<QueueKind, string> = {
  procedure: '/gro-processes',
  request: '/requests',
  task: '/tasks',
};

/** YYYY-MM-DD, `days` after the given date (UTC). */
export function addDays(iso: string, days: number) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function useQueueActions(item: QueueItem, onChanged: () => Promise<void> | void) {
  const t = useTranslations('queue');
  const locale = useLocale();
  const router = useRouter();
  const canGro = useCan('gro.process');
  const canTask = useCan('task.update');
  const canRequestUpdate = useCan('request.update');
  const canRequestProcess = useCan('request.process');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const requestApproved =
    item.request?.status === 'in_progress' || item.request?.status === 'info_needed';
  const canAssign =
    (item.kind === 'procedure' && canGro) ||
    (item.kind === 'task' && canTask) ||
    (item.kind === 'request' && canRequestProcess && requestApproved);
  const canSnooze =
    item.due !== null &&
    ((item.kind === 'procedure' && canGro) ||
      (item.kind === 'task' && canTask) ||
      (item.kind === 'request' && canRequestUpdate));

  const day = (iso: string) => {
    const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
    if (locale === 'ar') {
      return new Intl.DateTimeFormat('ar', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(d);
    }
    const month = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(d);
    return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
  };

  function patch(body: Record<string, unknown>, toast: string): Promise<boolean> {
    return send('PATCH', `${ENDPOINT[item.kind]}/${item.id}`, body, toast);
  }

  // Hand the item to someone: a request through its own route (REQ-05 — its
  // status stays), procedures and tasks through their update.
  function assign(userId: string, toast: string): Promise<boolean> {
    return item.kind === 'request'
      ? send('POST', `/requests/${item.id}/assign`, { assigneeUserId: userId }, toast)
      : patch({ assigneeUserId: userId }, toast);
  }

  async function send(
    method: 'PATCH' | 'POST',
    path: string,
    body: Record<string, unknown>,
    toast: string,
  ): Promise<boolean> {
    setBusy(true);
    setError('');
    try {
      await apiFetch(path, { method, body: JSON.stringify(body) });
      await onChanged();
      toastSuccess(toast);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login');
        return false;
      }
      setError(t('actionError'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const snooze = () => {
    if (!item.due) return Promise.resolve(false);
    const next = addDays(item.due, 7);
    return patch({ dueDate: next }, t('snoozed', { date: day(next) }));
  };

  return { busy, error, canAssign, canSnooze, canTask, patch, assign, snooze, day };
}
