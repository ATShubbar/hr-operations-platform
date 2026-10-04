'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, ClipboardList, MessageSquare, Stamp } from 'lucide-react';
import type { StaffDirectoryEntry } from '@hr/contracts';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DueCell, GroResolve } from '@/components/gro-work-list';
import { REQUEST_ASSIGNEE_ROLES, useQueueActions, type QueueItem } from './queue-actions';

// One Work queue row (DS-12): icon, title + reference, "who · client · status",
// due (with Hijri), the assignee, Snooze and Resolve — the prototype's row. The
// title opens the work-item dialog (DS-13). Who may do what is decided in
// queue-actions.ts, shared with the dialog.
//
// Resolve depends on the kind: a procedure gets the GRO status control (GRO-03
// expiry capture included), a task is marked done, a request opens on the
// Requests screen, where approve / decline live.

const ICON = { procedure: Stamp, request: MessageSquare, task: ClipboardList } as const;

export function QueueRow({
  item,
  staff,
  onChanged,
  onOpen,
}: {
  item: QueueItem;
  /** The people work can be handed to (administrator / HR / GRO officers). */
  staff: readonly StaffDirectoryEntry[];
  onChanged: () => Promise<void> | void;
  /** Open the work-item dialog (DS-13). */
  onOpen: () => void;
}) {
  const t = useTranslations('queue');
  const tr = useTranslations('roles');
  const [assignOpen, setAssignOpen] = useState(false);
  const { busy, error, canAssign, canSnooze, canTask, patch, assign, snooze } = useQueueActions(
    item,
    onChanged,
  );
  const who = staff.find((s) => s.id === item.assigneeUserId);
  const Icon = ICON[item.kind];

  // The prototype shows the assignee's FIRST name over their role — the column
  // is 132px, and the full name is in the picker.
  const assignee = who ? (
    <span className="flex min-w-0 grow items-center gap-2">
      <Avatar name={who.displayName} size="sm" />
      <span className="flex min-w-0 grow flex-col text-start">
        <span className="truncate text-xs leading-4 font-medium">
          {(who.displayName ?? '').split(' ')[0] || who.id.slice(0, 8)}
        </span>
        <span className="truncate text-[10px] leading-[13px] text-muted-foreground">
          {tr(who.role)}
        </span>
      </span>
    </span>
  ) : (
    <span className="grow truncate text-start text-xs leading-4 text-muted-foreground">
      {item.assigneeUserId ? t('someone') : t('unassigned')}
    </span>
  );

  return (
    <div className="flex flex-wrap items-center gap-3 border-t px-4 py-[11px] transition-colors hover:bg-neutral-50 sm:flex-nowrap">
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="flex min-w-0 grow basis-48 flex-col gap-px">
        <span className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="truncate text-start text-sm leading-5 font-medium outline-none hover:underline focus-visible:underline"
          >
            {item.title}
          </button>
          {item.ref && (
            <bdi dir="ltr" className="shrink-0 font-mono text-[11px] text-neutral-400">
              {item.ref}
            </bdi>
          )}
        </span>
        <span className="truncate text-xs leading-4 text-muted-foreground">{item.meta}</span>
        {error && (
          <span role="alert" className="text-[11px] leading-4 text-destructive">
            {error}
          </span>
        )}
      </span>

      <DueCell iso={item.due} />

      <div className="w-[132px] shrink-0">
        {canAssign ? (
          <Popover open={assignOpen} onOpenChange={setAssignOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  disabled={busy}
                  aria-label={t('assignLabel', { title: item.title })}
                  className="flex h-8 w-full items-center gap-2 rounded-md px-2 transition-colors outline-none hover:bg-neutral-100 focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              }
            >
              {assignee}
              <ChevronDown className="size-3 shrink-0 text-neutral-400" aria-hidden />
            </PopoverTrigger>
            <PopoverContent className="w-[264px] p-1">
              <p className="px-2.5 pt-1.5 pb-1 text-[11px] leading-4 font-medium text-muted-foreground">
                {t('assignHeading')}
              </p>
              <ul className="flex flex-col">
                {staff
                  // REQ-05: a request goes only to the roles that work on requests.
                  .filter((s) => item.kind !== 'request' || REQUEST_ASSIGNEE_ROLES.has(s.role))
                  .map((s) => {
                    const on = s.id === item.assigneeUserId;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => {
                            setAssignOpen(false);
                            if (!on)
                              void assign(s.id, t('reassigned', { name: s.displayName ?? '' }));
                          }}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-start hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
                            on && 'bg-neutral-100',
                          )}
                        >
                          <Avatar name={s.displayName} size="md" />
                          <span className="flex min-w-0 grow flex-col gap-px">
                            <span className="truncate text-[13px] leading-[17px] font-medium">
                              {s.displayName ?? s.id.slice(0, 8)}
                            </span>
                            <span className="truncate text-[11px] leading-[15px] text-muted-foreground">
                              {tr(s.role)}
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
          <div className="flex h-8 items-center px-2">{assignee}</div>
        )}
      </div>

      <span className="flex shrink-0 items-center gap-1.5">
        {canSnooze ? (
          <Button
            variant="ghost"
            size="xs"
            disabled={busy}
            onClick={() => void snooze()}
            title={t('snoozeHint')}
          >
            {t('snooze')}
          </Button>
        ) : (
          <span className="w-[60px]" aria-hidden />
        )}
        {item.kind === 'procedure' && item.gro ? (
          <GroResolve process={item.gro} onChanged={onChanged} className="h-6 w-28 text-xs" />
        ) : item.kind === 'task' && canTask ? (
          <Button
            variant="outline"
            size="xs"
            className="w-28"
            disabled={busy}
            onClick={() => void patch({ status: 'done' }, t('taskDone', { title: item.title }))}
          >
            {t('markDone')}
          </Button>
        ) : item.kind === 'request' ? (
          <Button
            variant="outline"
            size="xs"
            className="w-28"
            nativeButton={false}
            render={<Link href={item.recordHref ?? '/requests'} />}
          >
            {t('openRequest')}
          </Button>
        ) : null}
      </span>
    </div>
  );
}
