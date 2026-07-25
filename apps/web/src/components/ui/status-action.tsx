'use client';

import { useTranslations } from 'next-intl';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// The workflow control (UX-09).
//
// Four screens advance an item through a status workflow — requests, GRO
// processes, vacancies, candidates — and each had built its own affordance:
// vacancies a Select in the row, candidates a Select on a board card, requests
// and GRO a button that opened a dialog whose only job was to hold another
// Select. Same decision, four shapes.
//
// What is genuinely shared is narrow, and that is all this component owns:
// GIVEN THE CURRENT STATUS, OFFER EXACTLY THE LEGAL NEXT ONES, TRANSLATED.
// It deliberately does NOT own what happens next. A screen that needs to collect
// something before applying (GRO asks for the resulting expiry when a process
// completes) still opens its own dialog from `onSelect` — the menu is the same,
// the consequence is the screen's business.
//
// The legal transitions themselves stay where they are: each screen's NEXT map
// mirrors the server-side workflow, and the server validates regardless.
export function StatusAction<T extends string>({
  next,
  onSelect,
  label,
  placeholder,
  terminalLabel,
  className,
}: {
  /** Legal next statuses for the item's CURRENT status. Empty = terminal. */
  next: readonly T[];
  onSelect: (status: T) => void;
  /** Translated label for a status value. */
  label: (status: T) => string;
  /** Trigger copy — "change status", "advance". */
  placeholder: string;
  /** Shown instead of the control when there is nowhere left to go. */
  terminalLabel?: string;
  className?: string;
}) {
  const t = useTranslations('states');

  if (next.length === 0) {
    return (
      <span className="text-sm text-muted-foreground">{terminalLabel ?? t('terminal')}</span>
    );
  }

  return (
    // `value=""` on purpose: this is an ACTION menu, not a bound field. The
    // trigger always reads as the invitation ("change status"), never as the
    // last thing that was picked — picking applies immediately and the row's own
    // status column is what reflects the result.
    <Select value="" onValueChange={(v) => v && onSelect(v as T)}>
      <SelectTrigger className={cn('h-8 w-40', className)}>
        <SelectValue placeholder={placeholder}>{() => placeholder}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {next.map((s) => (
          <SelectItem key={s} value={s}>
            {label(s)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
