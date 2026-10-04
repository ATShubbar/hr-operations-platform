'use client';

import { useTranslations } from 'next-intl';
import { ClipboardList, MessageSquare, Stamp } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { DueCell, GroResolve } from '@/components/gro-work-list';
import { useQueueActions, type QueueItem } from '../queue/queue-actions';

// One "Needs you first" row on the Overview (DS-17) — the prototype's: icon,
// title + "who · client · status", the due date with its Hijri twin, Resolve.
// Lighter than the Work queue's row (no assignee, no Snooze — the prototype
// leaves those to the queue), but the same item, the same dialog on the title,
// and the same per-kind Resolve, decided in queue-actions.ts:
// a procedure gets the GRO status control (GRO-03 expiry capture included), a
// task is marked done, a request opens on the Requests screen.

const ICON = { procedure: Stamp, request: MessageSquare, task: ClipboardList } as const;

export function NeedsRow({
  item,
  onChanged,
  onOpen,
}: {
  item: QueueItem;
  onChanged: () => Promise<void> | void;
  /** Open the work-item dialog (DS-13). */
  onOpen: () => void;
}) {
  const t = useTranslations('queue');
  const { busy, error, canTask, patch } = useQueueActions(item, onChanged);
  const Icon = ICON[item.kind];

  return (
    <li className="flex flex-wrap items-center gap-3 border-t px-4 py-2.5 sm:flex-nowrap">
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="flex min-w-0 grow basis-40 flex-col gap-px">
        <button
          type="button"
          onClick={onOpen}
          className="truncate text-start text-sm leading-5 font-medium outline-none hover:underline focus-visible:underline"
        >
          {item.title}
        </button>
        <span className="truncate text-xs leading-4 text-muted-foreground">{item.meta}</span>
        {error && (
          <span role="alert" className="text-[11px] leading-4 text-destructive">
            {error}
          </span>
        )}
      </span>
      <DueCell iso={item.due} />
      <span className="flex shrink-0">
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
        ) : (
          <span className="w-28" aria-hidden />
        )}
      </span>
    </li>
  );
}
