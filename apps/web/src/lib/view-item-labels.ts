'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';

// Labels for `/calendar/view` items (UX-09).
//
// That endpoint merges four domains and returns RAW API enums — and for GRO items
// it uses the process TYPE as the item's title. So an untranslated `iqama_renewal`
// would headline the row and `in_progress` would sit next to it, in Arabic.
//
// UX-04 fixed this on "Today" by reusing each domain screen's existing label maps.
// The calendar agenda had the same bug, which makes this the second consumer —
// so the mapping lives here rather than being copied. Any third view over
// /calendar/view gets it for free.
//
// Every lookup falls back to the raw value: a new server-side enum should render
// as itself, not crash the screen it appears on.

export type ViewItemKind = 'task' | 'request' | 'gro' | 'event' | 'document';

export function useViewItemLabels(): {
  statusLabel: (kind: ViewItemKind, value: string | null | undefined) => string | null;
  titleFor: (kind: ViewItemKind, rawTitle: string) => string;
} {
  const tGro = useTranslations('gro');
  const tReq = useTranslations('requests');
  const tTask = useTranslations('tasks');
  const tDoc = useTranslations('documents');

  const statusLabel = useCallback(
    (kind: ViewItemKind, value: string | null | undefined): string | null => {
      if (!value) return null;
      const lookup = (tt: (k: string) => string, key: string) => {
        try {
          return tt(key);
        } catch {
          return value;
        }
      };
      if (kind === 'gro') return lookup(tGro as never, `status.${value}`);
      if (kind === 'request') return lookup(tReq as never, `status.${value}`);
      if (kind === 'task') return lookup(tTask as never, `status.${value}`);
      // For a document the "status" slot carries its CATEGORY (iqama, passport…),
      // which is the useful thing to show beside an expiry.
      if (kind === 'document') return lookup(tDoc as never, `category.${value}`);
      return value;
    },
    [tGro, tReq, tTask, tDoc],
  );

  const titleFor = useCallback(
    (kind: ViewItemKind, rawTitle: string): string => {
      if (kind !== 'gro') return rawTitle;
      try {
        return (tGro as never as (k: string) => string)(`type.${rawTitle}`);
      } catch {
        return rawTitle;
      }
    },
    [tGro],
  );

  return { statusLabel, titleFor };
}
