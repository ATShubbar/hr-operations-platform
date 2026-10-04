'use client';

import { useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { GroProcessStatus, StaffDirectoryEntry } from '@hr/contracts';
import { formatHijri } from '@hr/dates';
import { Link } from '@/i18n/navigation';
import { chipClass, daysTo } from '@/lib/employee-docs';
import type { Locale } from '@/lib/employee-format';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GroResolve } from '@/components/gro-work-list';
import { useQueueActions, type QueueItem } from './queue-actions';

// The work-item dialog (DS-13) — the prototype's drawer for one queue item:
// who and which company it concerns, when it is due (chip + Hijri), what it is
// about, where a procedure stands, who owns it, and the item's actions.
//
// - "Where this stands" for a procedure is the GRO workflow position, read from
//   its real status (not started → in progress → submitted → approved →
//   completed); a rejected one sits at submission, labelled rejected.
// - Tasks are edited here (status + priority, as the Tasks screen offered) —
//   the queue is now where open tasks are worked; Task history keeps the rest.
// - Attachments and comments are the request-thread feature: shown, "coming soon".
// - The footer's actions are the row's (queue-actions.ts), so the two agree.

const STEPS: readonly GroProcessStatus[] = [
  'not_started',
  'in_progress',
  'submitted',
  'approved',
  'completed',
];
const TASK_STATUSES = ['open', 'in_progress', 'done', 'cancelled'] as const;
const PRIORITIES = ['low', 'normal', 'high'] as const;

export function WorkItemDialog({
  item,
  staff,
  onChanged,
  onClose,
}: {
  item: QueueItem | null;
  staff: readonly StaffDirectoryEntry[];
  onChanged: () => Promise<void> | void;
  onClose: () => void;
}) {
  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      {/* DialogContent is a grid; its items default to min-width:auto, so a
          truncating line (a long Arabic role) set a minimum wider than a phone —
          measured 351px in a 343px dialog. min-w-0 lets them shrink and truncate. */}
      <DialogContent className="sm:max-w-[620px] [&>*]:min-w-0">
        {item && (
          <Body
            key={`${item.kind}-${item.id}`}
            item={item}
            staff={staff}
            onChanged={onChanged}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  item,
  staff,
  onChanged,
  onClose,
}: {
  item: QueueItem;
  staff: readonly StaffDirectoryEntry[];
  onChanged: () => Promise<void> | void;
  onClose: () => void;
}) {
  const t = useTranslations('queue');
  const tp = useTranslations('people');
  const tg = useTranslations('gro');
  const tt = useTranslations('tasks');
  const tr = useTranslations('roles');
  const locale = useLocale() as Locale;
  const { busy, error, canSnooze, canTask, patch, snooze, day } = useQueueActions(item, onChanged);
  // DS-22b: an item from the queue's Finished view is read-only here — no
  // Snooze, no Resolve / Mark done, no task editor; it says when it finished.
  const finished = item.finishedAt !== null;
  const who = staff.find((s) => s.id === item.assigneeUserId);
  const [status, setStatus] = useState(item.task?.status ?? 'open');
  const [priority, setPriority] = useState(item.task?.priority ?? 'normal');
  const taskDirty =
    item.task !== undefined && (status !== item.task.status || priority !== item.task.priority);

  const n = item.due ? daysTo(item.due) : null;
  const sub = [item.ref, item.person?.name, item.clientName].filter(Boolean).join(' · ');

  const detail =
    item.kind === 'request'
      ? item.request?.description
      : item.kind === 'task'
        ? item.task?.description
        : item.gro?.notes;
  const g = item.gro;
  const stepIndex = g ? (g.status === 'rejected' ? 2 : STEPS.indexOf(g.status)) : -1;

  const fact = (label: string, body: ReactNode) => (
    <div className="flex flex-col gap-px">
      <span className="text-[11px] leading-[15px] text-muted-foreground">{label}</span>
      {body}
    </div>
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>{item.title}</DialogTitle>
        {sub && <DialogDescription>{sub}</DialogDescription>}
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 rounded-md bg-neutral-50 px-3.5 py-3 ring-1 ring-foreground/10 sm:grid-cols-3">
          {fact(
            item.kind === 'request' ? t('factRequester') : t('factEmployee'),
            item.person ? (
              <span className="flex flex-col">
                <span className="text-[13px] leading-[18px]">{item.person.name}</span>
                {item.person.ar && item.person.ar !== item.person.name && (
                  <span dir="rtl" className="w-fit text-xs leading-4 text-muted-foreground">
                    {item.person.ar}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-[13px] leading-[18px] text-neutral-400">—</span>
            ),
          )}
          {fact(
            t('factClient'),
            <span className="text-[13px] leading-[18px]">{item.clientName ?? '—'}</span>,
          )}
          {fact(
            t('factDue'),
            item.due && n !== null ? (
              <span className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] leading-[18px]">{day(item.due)}</span>
                  {/* A finished item is not overdue (DS-22b). */}
                  {!finished && (
                    <span
                      className={cn(
                        'inline-flex h-5 items-center rounded-full px-2 font-mono text-[11px] leading-5 whitespace-nowrap',
                        chipClass(n),
                      )}
                    >
                      {n < 0 ? tp('over', { n: Math.abs(n) }) : tp('left', { n })}
                    </span>
                  )}
                </span>
                <span className="text-[10px] leading-[14px] text-neutral-400">
                  {formatHijri(new Date(item.due), locale)}
                </span>
              </span>
            ) : (
              <span className="text-[13px] leading-[18px] text-neutral-400">{t('noDue')}</span>
            ),
          )}
          {finished &&
            item.finishedAt &&
            fact(
              t('factFinished'),
              <span className="text-[13px] leading-[18px]">{day(item.finishedAt)}</span>,
            )}
        </div>

        <section aria-labelledby="wi-detail" className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h3 id="wi-detail" className="grow text-[13px] leading-[18px] font-medium">
              {t(`detailHeading.${item.kind}`)}
            </h3>
            <Badge variant="secondary">{t(`kindName.${item.kind}`)}</Badge>
          </div>
          {g && stepIndex >= 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2 text-xs">
                <span className="grow text-muted-foreground">
                  {t('step', { n: stepIndex + 1, total: STEPS.length })}
                </span>
                <span className="font-medium">{tg(`status.${g.status}`)}</span>
              </div>
              <div
                role="meter"
                aria-label={t('progress')}
                aria-valuenow={stepIndex + 1}
                aria-valuemin={1}
                aria-valuemax={STEPS.length}
                className="h-1.5 overflow-hidden rounded-full bg-neutral-100"
              >
                <div
                  className={cn(
                    'h-1.5 rounded-full',
                    g.status === 'rejected' ? 'bg-status-critical' : 'bg-neutral-900',
                  )}
                  style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
                />
              </div>
            </div>
          )}
          <p className="text-[13px] leading-5 text-pretty whitespace-pre-line text-neutral-700">
            {detail || <span className="text-neutral-400">{t('noDetail')}</span>}
          </p>
        </section>

        {item.task && canTask && !finished && (
          <section aria-labelledby="wi-task" className="flex flex-col gap-2">
            <h3 id="wi-task" className="text-[13px] leading-[18px] font-medium">
              {t('editTask')}
            </h3>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wi-status">{tt('fieldStatus')}</Label>
                <Select value={status} onValueChange={(v) => setStatus(v ?? status)}>
                  <SelectTrigger id="wi-status" className="w-40">
                    <SelectValue>{(v) => tt(`status.${String(v)}`)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {tt(`status.${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wi-priority">{tt('fieldPriority')}</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v ?? priority)}>
                  <SelectTrigger id="wi-priority" className="w-36">
                    <SelectValue>{(v) => tt(`priority.${String(v)}`)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {tt(`priority.${p}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!taskDirty || busy}
                onClick={() => void patch({ status, priority }, t('taskSaved'))}
              >
                {t('saveTask')}
              </Button>
            </div>
          </section>
        )}

        <div className="flex items-center gap-2.5 rounded-md px-3 py-2.5 ring-1 ring-foreground/10">
          {who ? <Avatar name={who.displayName} size="sm" /> : null}
          <span className="flex min-w-0 grow flex-col">
            <span className="truncate text-[13px] leading-[18px] font-medium">
              {who?.displayName ?? t('unassigned')}
            </span>
            {who && (
              <span className="truncate text-[11px] leading-[15px] text-muted-foreground">
                {t('owns', { role: tr(who.role) })}
              </span>
            )}
          </span>
          {item.recordHref && (
            <Button
              variant="ghost"
              size="xs"
              nativeButton={false}
              render={<Link href={item.recordHref} />}
            >
              {t('openRecord')}
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-1 rounded-md px-3.5 py-3 ring-1 ring-foreground/10">
          <span className="text-[13px] leading-[18px] font-medium">{t('threadTitle')}</span>
          <span className="text-xs leading-4 text-muted-foreground">{t('threadSoon')}</span>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <DialogFooter className="items-center sm:justify-start">
        {canSnooze && !finished && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void snooze()}>
            {t('snoozeSeven')}
          </Button>
        )}
        <span className="hidden grow sm:block" />
        <Button variant="outline" size="sm" onClick={onClose}>
          {t('close')}
        </Button>
        {finished ? (
          item.kind === 'request' && item.recordHref ? (
            <Button size="sm" nativeButton={false} render={<Link href={item.recordHref} />}>
              {t('openRequest')}
            </Button>
          ) : null
        ) : item.kind === 'procedure' && g ? (
          <GroResolve process={g} onChanged={onChanged} className="h-7 w-36 text-xs" />
        ) : item.kind === 'task' && canTask ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void patch({ status: 'done' }, t('taskDone', { title: item.title }))}
          >
            {t('markDone')}
          </Button>
        ) : item.kind === 'request' && item.recordHref ? (
          <Button size="sm" nativeButton={false} render={<Link href={item.recordHref} />}>
            {t('openRequest')}
          </Button>
        ) : null}
      </DialogFooter>
    </>
  );
}
