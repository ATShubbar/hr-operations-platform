'use client';

import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { AuditEntry } from '@hr/contracts';
import { categoryOf, CATEGORY_CLASS } from '@/lib/audit-category';
import { changesOf, type ChangeFormat } from '@/lib/audit-changes';
import { toneFor } from '@/lib/status-tone';
import { cn } from '@/lib/utils';
import { ChangeList } from '@/components/change-list';
import { Avatar } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusPill } from '@/components/ui/status-pill';
import { dateFormat, hijriDate } from '@/lib/dates';

// One audit entry (DS-15) — the prototype's detail dialog: what happened to
// which record, the category, who, when (both calendars), and — owner decision —
// each changed field as before → after, in words (AUDIT-12: field names and
// values translated, dates in both calendars). That is what audit.read already
// returns to its holders (Administrator, Auditor); nothing new is exposed.
//
// Not recorded, and said so: the source address (the log has none). The
// severity is the server's (AUDIT-07).

const MAX_FIELDS = 30;

export function EntryDialog({
  entry,
  actor,
  role,
  action,
  target,
  format,
  onClose,
}: {
  entry: AuditEntry | null;
  actor: string;
  role: string;
  action: string;
  target: string;
  /** How field names and values read (AUDIT-12) — the page knows the names. */
  format: ChangeFormat;
  onClose: () => void;
}) {
  const t = useTranslations('audit');
  const locale = useLocale() as 'ar' | 'en';
  const changes = entry ? changesOf(entry.before, entry.after) : [];
  const cat = entry ? categoryOf(entry.resource) : 'records';
  const when = entry ? new Date(entry.createdAt) : null;

  const fact = (label: string, body: ReactNode) => (
    <div className="flex flex-col gap-px">
      <span className="text-[11px] leading-[15px] text-muted-foreground">{label}</span>
      {body}
    </div>
  );

  return (
    <Dialog open={entry !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px] [&>*]:min-w-0">
        {entry && when && (
          <>
            <DialogHeader>
              <DialogTitle>{action}</DialogTitle>
              <DialogDescription>{target}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-1.5">
                <span
                  className={cn(
                    'inline-flex h-5 items-center rounded-full px-2 text-[11px] leading-5 font-medium',
                    CATEGORY_CLASS[cat],
                  )}
                >
                  {t(`category.${cat}`)}
                </span>
                <StatusPill tone={toneFor('auditSeverity', entry.severity)}>
                  {t(`severity.${entry.severity}`)}
                </StatusPill>
              </div>

              <section aria-labelledby="ae-changes" className="flex flex-col gap-1.5">
                <h3 id="ae-changes" className="text-[13px] leading-[18px] font-medium">
                  {t('changes', { count: changes.length })}
                </h3>
                {changes.length === 0 ? (
                  <p className="text-[13px] leading-5 text-muted-foreground">{t('noChanges')}</p>
                ) : (
                  <ChangeList
                    format={format}
                    resource={entry.resource}
                    changes={changes}
                    max={MAX_FIELDS}
                    className="max-h-72 overflow-y-auto"
                  />
                )}
              </section>

              <div className="grid grid-cols-1 gap-x-4 gap-y-3 rounded-md bg-neutral-50 px-3.5 py-3 ring-1 ring-foreground/10 sm:grid-cols-2">
                {fact(
                  t('actor'),
                  <span className="flex items-center gap-2">
                    <Avatar name={actor} size="sm" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[13px] leading-[18px]">{actor}</span>
                      {role && (
                        <span className="truncate text-[11px] leading-[15px] text-muted-foreground">
                          {role}
                        </span>
                      )}
                    </span>
                  </span>,
                )}
                {fact(
                  t('when'),
                  <span className="flex flex-col">
                    <span className="text-[13px] leading-[18px]">
                      {dateFormat(locale === 'ar' ? 'ar' : 'en-GB', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(when)}
                    </span>
                    <span className="text-[11px] leading-[15px] text-neutral-400">
                      {hijriDate(when, locale)}
                    </span>
                  </span>,
                )}
                {fact(
                  t('sourceAddress'),
                  <span className="text-[13px] leading-[18px] text-neutral-400">
                    {t('notRecorded')}
                  </span>,
                )}
                {fact(
                  t('requestId'),
                  <bdi dir="ltr" className="truncate font-mono text-[11px] leading-[18px]">
                    {entry.requestId ?? '—'}
                  </bdi>,
                )}
              </div>

              <p className="text-xs leading-4 text-muted-foreground">{t('retention')}</p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
