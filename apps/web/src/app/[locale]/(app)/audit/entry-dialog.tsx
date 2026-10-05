'use client';

import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { AuditEntry } from '@hr/contracts';
import { formatHijri } from '@hr/dates';
import { categoryOf, CATEGORY_CLASS } from '@/lib/audit-category';
import { toneFor } from '@/lib/status-tone';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusPill } from '@/components/ui/status-pill';

// One audit entry (DS-15) — the prototype's detail dialog: what happened to
// which record, the category, who, when (both calendars), and — owner decision —
// each changed field as before → after. That is what audit.read already returns
// to its holders (Administrator, Auditor); nothing new is exposed.
//
// Not recorded, and said so: the source address (the log has none). The
// severity is the server's (AUDIT-07).

const MAX_FIELDS = 30;

type Snapshot = Record<string, unknown> | null;
const asObject = (v: unknown): Snapshot =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

/** Fields whose value differs between the two snapshots (all of one side when the other is absent). */
export function changedFields(before: unknown, after: unknown) {
  const b = asObject(before);
  const a = asObject(after);
  const keys = [...new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})])];
  return keys
    .filter((k) => JSON.stringify(b?.[k]) !== JSON.stringify(a?.[k]))
    .map((k) => ({ field: k, before: b ? show(b[k]) : null, after: a ? show(a[k]) : null }));
}

export function EntryDialog({
  entry,
  actor,
  role,
  action,
  target,
  onClose,
}: {
  entry: AuditEntry | null;
  actor: string;
  role: string;
  action: string;
  target: string;
  onClose: () => void;
}) {
  const t = useTranslations('audit');
  const locale = useLocale() as 'ar' | 'en';
  const changes = entry ? changedFields(entry.before, entry.after) : [];
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
                  <dl className="flex max-h-64 flex-col overflow-y-auto rounded-md ring-1 ring-foreground/10">
                    {changes.slice(0, MAX_FIELDS).map((c) => (
                      <div
                        key={c.field}
                        className="grid grid-cols-1 gap-x-3 gap-y-0.5 border-t px-3 py-2 first:border-t-0 sm:grid-cols-[140px_1fr]"
                      >
                        <dt className="truncate font-mono text-[11px] leading-5 text-muted-foreground">
                          {c.field}
                        </dt>
                        <dd className="min-w-0 text-[12px] leading-5 break-words">
                          {c.before !== null && (
                            <span className="text-status-critical line-through decoration-status-critical/40">
                              {c.before}
                            </span>
                          )}
                          {c.before !== null && c.after !== null && (
                            <span aria-hidden className="mx-1.5 text-muted-foreground">
                              →
                            </span>
                          )}
                          {c.after !== null && <span className="text-status-ok">{c.after}</span>}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                {changes.length > MAX_FIELDS && (
                  <p className="text-xs text-muted-foreground">
                    {t('moreFields', { count: changes.length - MAX_FIELDS })}
                  </p>
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
                      {new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(when)}
                    </span>
                    <span className="text-[11px] leading-[15px] text-neutral-400">
                      {formatHijri(when, locale)}
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
