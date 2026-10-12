'use client';

import { useMemo } from 'react';
import { useLocale, useMessages, useTranslations } from 'next-intl';
import { EMPTY, fieldLabel, fieldValue, type Change, type ChangeFormat } from '@/lib/audit-changes';
import { dateFormat, hijriDate } from '@/lib/dates';
import { useMoney } from '@/lib/money';
import { useNationalityName } from '@/lib/nationality';
import { cn } from '@/lib/utils';
import { DotLine } from '@/components/ui/dot-line';

// What changed, old → new, in words (AUDIT-12, ADR-022). Shared by the Audit
// trail (a short line on each row, the whole list in the entry window) and by a
// person's History.

/** Everything `lib/audit-changes` needs from the screen. Names are the caller's: it knows who it may name. */
export function useChangeFormat(names: {
  userName: (id: string) => string | null;
  clientName: (id: string) => string | null;
}): ChangeFormat {
  const locale = useLocale() as 'ar' | 'en';
  const messages = useMessages() as Record<string, unknown>;
  const nationality = useNationalityName(locale);
  const money = useMoney();
  const { userName, clientName } = names;

  return useMemo(() => {
    const text = (path: string): string | undefined => {
      let node: unknown = messages;
      for (const part of path.split('.')) {
        if (!node || typeof node !== 'object') return undefined;
        node = (node as Record<string, unknown>)[part];
      }
      return typeof node === 'string' ? node : undefined;
    };
    const at = (day: string) => new Date(`${day}T00:00:00.000Z`);
    // A recorded day is a calendar day, not an instant: read it in UTC, or a
    // reader west of Greenwich would be shown the day before.
    const day = (text: string) => {
      const d = at(text);
      if (locale === 'ar') {
        return dateFormat('ar', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(d);
      }
      const month = dateFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(d);
      return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
    };
    return {
      locale,
      text,
      userName,
      clientName,
      nationality: (code) => nationality(code),
      day,
      hijri: (day) => hijriDate(at(day), locale),
      instant: (iso) =>
        dateFormat(locale === 'ar' ? 'ar' : 'en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(iso)),
      money,
    };
    // `nationality` and `money` are rebuilt each render and depend on the locale alone.
  }, [locale, messages, userName, clientName]);
}

/**
 * One value's change. The arrow says which way: in English old → new; in Arabic
 * the pair runs from the right, so the old value is on the right and the arrow
 * points left to the new one.
 */
function ChangeValue({
  format,
  resource,
  change,
  full,
}: {
  format: ChangeFormat;
  resource: string;
  change: Change;
  full?: boolean;
}) {
  const t = useTranslations('auditChange');
  const rtl = format.locale === 'ar';
  const before = change.had ? fieldValue(format, resource, change.key, change.before, full) : null;
  const after = change.has ? fieldValue(format, resource, change.key, change.after, full) : null;
  return (
    <span dir={rtl ? 'rtl' : 'ltr'}>
      {before !== null && (
        <>
          <span className="sr-only">{t('from')} </span>
          <bdi
            className={cn(
              'text-muted-foreground',
              before !== EMPTY && 'line-through decoration-foreground/30',
            )}
          >
            {before}
          </bdi>
        </>
      )}
      {before !== null && after !== null && (
        <>
          <span aria-hidden className="mx-1.5 text-muted-foreground">
            {rtl ? '←' : '→'}
          </span>
          <span className="sr-only"> {t('to')} </span>
        </>
      )}
      {after !== null && <bdi>{after}</bdi>}
    </span>
  );
}

/** The short form for a row: the first changes, then how many more. */
export function ChangeSummary({
  format,
  resource,
  changes,
  max = 2,
  className,
}: {
  format: ChangeFormat;
  resource: string;
  changes: Change[];
  max?: number;
  className?: string;
}) {
  const t = useTranslations('auditChange');
  if (changes.length === 0) return null;
  const rest = changes.length - max;
  // A line too long for the row is cut at its END. In Arabic the line is one
  // right-to-left run inside an element, which the `truncate` rule (UX-23) reads
  // as having no direction of its own — it would clip the START. So the cut
  // element is given the direction itself; the inline style is what outranks
  // the rule's `unicode-bidi: plaintext`.
  const rtl = format.locale === 'ar';
  return (
    <span
      dir={rtl ? 'rtl' : undefined}
      style={rtl ? { unicodeBidi: 'isolate' } : undefined}
      className={cn('truncate', className)}
    >
      <DotLine>
        {changes.slice(0, max).map((c) => (
          <span key={c.key}>
            {fieldLabel(format, resource, c.key)}
            {': '}
            <ChangeValue format={format} resource={resource} change={c} />
          </span>
        ))}
        {rest > 0 ? <span>{t('more', { count: rest })}</span> : null}
      </DotLine>
    </span>
  );
}

/** Every change, one per line: the field, then old → new (dates in both calendars). */
export function ChangeList({
  format,
  resource,
  changes,
  max = 30,
  className,
}: {
  format: ChangeFormat;
  resource: string;
  changes: Change[];
  max?: number;
  className?: string;
}) {
  const t = useTranslations('auditChange');
  if (changes.length === 0) return null;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <dl className="flex flex-col rounded-md ring-1 ring-foreground/10">
        {changes.slice(0, max).map((c) => (
          <div
            key={c.key}
            className="grid grid-cols-1 gap-x-3 gap-y-0.5 border-t px-3 py-2 first:border-t-0 sm:grid-cols-[160px_1fr]"
          >
            <dt className="text-xs leading-5 text-muted-foreground">
              {fieldLabel(format, resource, c.key)}
            </dt>
            <dd className="min-w-0 text-[13px] leading-5 [overflow-wrap:anywhere]">
              <ChangeValue format={format} resource={resource} change={c} full />
            </dd>
          </div>
        ))}
      </dl>
      {changes.length > max && (
        <p className="text-xs text-muted-foreground">
          {t('more', { count: changes.length - max })}
        </p>
      )}
    </div>
  );
}
