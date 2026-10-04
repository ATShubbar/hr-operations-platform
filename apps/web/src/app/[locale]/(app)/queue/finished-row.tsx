'use client';

import { useLocale, useTranslations } from 'next-intl';
import { ClipboardList, MessageSquare, Stamp } from 'lucide-react';
import type { StaffDirectoryEntry } from '@hr/contracts';
import { formatHijri } from '@hr/dates';
import { Avatar } from '@/components/ui/avatar';
import type { QueueItem } from './queue-actions';

// One row of the Work queue's Finished view (DS-22b) — the history the GRO and
// Task history screens used to hold. Read-only: no Resolve, Snooze or assignee
// picker (a finished item has no next step); the title still opens the
// work-item dialog for the detail. "Finished" is the item's last update.

const ICON = { procedure: Stamp, request: MessageSquare, task: ClipboardList } as const;

export function FinishedRow({
  item,
  staff,
  onOpen,
}: {
  item: QueueItem;
  staff: readonly StaffDirectoryEntry[];
  onOpen: () => void;
}) {
  const t = useTranslations('queue');
  const tr = useTranslations('roles');
  const locale = useLocale() as 'ar' | 'en';
  const Icon = ICON[item.kind];
  const who = staff.find((s) => s.id === item.assigneeUserId);
  const when = item.finishedAt ? new Date(item.finishedAt) : null;

  return (
    <div className="flex flex-wrap items-center gap-3 border-t px-4 py-[11px] sm:flex-nowrap">
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-500">
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
      </span>
      <span className="flex w-28 shrink-0 flex-col items-end">
        {when && (
          <>
            <span className="text-[13px] leading-[17px]">
              {new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              }).format(when)}
            </span>
            <span className="text-[10px] leading-[14px] text-neutral-400">
              {formatHijri(when, locale)}
            </span>
          </>
        )}
      </span>
      <span className="flex w-[132px] shrink-0 items-center gap-2 px-2">
        {who ? (
          <>
            <Avatar name={who.displayName} size="sm" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-xs leading-4 font-medium">
                {(who.displayName ?? '').split(' ')[0] || who.id.slice(0, 8)}
              </span>
              <span className="truncate text-[10px] leading-[13px] text-muted-foreground">
                {tr(who.role)}
              </span>
            </span>
          </>
        ) : (
          <span className="truncate text-xs text-muted-foreground">
            {item.assigneeUserId ? t('someone') : t('unassigned')}
          </span>
        )}
      </span>
    </div>
  );
}
