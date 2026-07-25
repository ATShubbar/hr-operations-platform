'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

// Page-level load states (UX-06).
//
// Before this, a failed load rendered one red sentence and stopped. There was no
// way back except a manual page reload — 34 sites across 19 screens.
//
// The distinction this file draws, and why it is two components:
//
//   LoadError → the request FAILED. Retrying is the correct response, so it gets
//               a retry that re-runs the loader in place.
//   NoAccess  → the request was REFUSED (403). Retrying a permission denial just
//               fails again, so it deliberately has NO retry. It names the
//               capability instead, because the user's real next step is to ask
//               someone for it.
//
// Form and mutation errors are NOT in scope and stay inline beside their submit
// button: the failure belongs next to the control that caused it, and a
// page-level banner loses the field context.

export function LoadError({
  message,
  onRetry,
  /**
   * True when the screen still has content on display. Several screens funnel
   * BOTH a failed load and a failed row action (a download, an archive) into the
   * same `error` state, so replacing the whole table on a failed download would
   * destroy the list the user was working in. With content present the failure
   * becomes a banner above it; with nothing to show it takes the region.
   */
  hasContent = false,
}: {
  message?: string;
  onRetry: () => void;
  hasContent?: boolean;
}) {
  const t = useTranslations('states');

  if (hasContent) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-status-critical-line bg-status-critical-surface px-4 py-3"
      >
        <p className="text-sm text-status-critical">{message ?? t('errorHint')}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  return (
    <EmptyState
      variant="error"
      title={t('errorTitle')}
      description={message ?? t('errorHint')}
      action={
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t('retry')}
        </Button>
      }
    />
  );
}

export function NoAccess({ capability }: { capability?: string }) {
  const t = useTranslations('states');
  return (
    <EmptyState
      variant="restricted"
      title={t('forbiddenTitle')}
      description={
        capability
          ? // <bdi> isolates the permission id from the surrounding paragraph.
            // Without it a Latin identifier inside Arabic drags the sentence's
            // final full stop to the wrong side — visible as "gro.read." rendering
            // as ".gro.read". Not introducing a new instance of the bug UX-08 is
            // scheduled to clean up.
            t.rich('forbiddenWithCapability', {
              capability,
              cap: (chunks) => <bdi className="font-medium">{chunks}</bdi>,
            })
          : t('forbiddenHint')
      }
    />
  );
}
