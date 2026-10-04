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
// - Assign: procedures (gro.process) and tasks (task.update). A request's
//   assignee only moves together with its status (REQ-03 `process`; REQ-05 is
//   the follow-up), so requests are not reassigned here.
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
  assigneeUserId: string | null;
  /** Where the item lives outside the queue (the person, the request), if anywhere. */
  recordHref: string | null;
  gro?: GroProcessResponse;
  request?: RequestResponse;
  task?: TaskResponse;
  searchText: string[];
}

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canAssign = (item.kind === 'procedure' && canGro) || (item.kind === 'task' && canTask);
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

  async function patch(body: Record<string, unknown>, toast: string): Promise<boolean> {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`${ENDPOINT[item.kind]}/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
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

  return { busy, error, canAssign, canSnooze, canTask, patch, snooze, day };
}
