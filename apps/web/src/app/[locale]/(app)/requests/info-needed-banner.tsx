'use client';

import { useTranslations } from 'next-intl';
import { MessageCircleQuestion } from 'lucide-react';

// While a request is `info_needed` (THREAD-03): staff see who it waits on; the
// requester's side (client manager or the employee who raised it) sees what to
// do — reply below, and the request goes back to the team.
export function InfoNeededBanner({ audience }: { audience: 'staff' | 'requester' }) {
  const t = useTranslations('requests');
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-md bg-status-warning-surface px-3.5 py-3 ring-1 ring-status-warning-line"
    >
      <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] leading-[18px] font-medium">
          {audience === 'staff' ? t('infoStaffTitle') : t('infoRequesterTitle')}
        </span>
        <span className="text-xs leading-4 text-muted-foreground">
          {audience === 'staff' ? t('infoStaffSub') : t('infoRequesterSub')}
        </span>
      </span>
    </div>
  );
}
