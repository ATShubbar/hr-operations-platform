'use client';

import { useEffect, useState } from 'react';
import { useLocale, useMessages, useTranslations } from 'next-intl';
import type { EmployeeHistoryEntry, EmployeeHistoryResponse } from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import type { Locale } from '@/lib/employee-format';
import { cn } from '@/lib/utils';
import { LoadError } from '@/components/ui/load-state';
import { Skeleton } from '@/components/ui/skeleton';

// The Person record's History tab (AUDIT-06) — the prototype's Timeline over
// GET /employees/:id/history: what happened on this person's record, their
// self-service account, their documents and their GRO processes, newest first.
//
// The API sends curated facts only (action, which record, who, when) — never the
// audit snapshots — so this tab can only ever say "Government data updated", not
// what it was changed to. Entries from before AUDIT-06 carry no record id and
// are absent; the tab says so rather than implying the record has no past.

type Tone = 'primary' | 'info' | 'success' | 'warning' | 'error' | 'muted';

// The design system's Timeline tones: a 12px dot in an 18px halo.
const TONE: Record<Tone, { dot: string; halo: string }> = {
  primary: { dot: 'bg-[rgb(23,23,23)]', halo: 'bg-[rgba(23,23,23,0.2)]' },
  info: { dot: 'bg-status-info', halo: 'bg-[rgba(2,132,199,0.2)]' },
  success: { dot: 'bg-status-ok', halo: 'bg-[rgba(22,163,74,0.1)]' },
  warning: { dot: 'bg-status-warning', halo: 'bg-[rgba(217,119,6,0.2)]' },
  error: { dot: 'bg-status-critical', halo: 'bg-[rgba(220,38,38,0.2)]' },
  muted: { dot: 'bg-[rgb(163,163,163)]', halo: 'bg-[rgba(163,163,163,0.2)]' },
};

// What deserves colour on a person's timeline: a beginning, a completed step,
// an ending, a problem. Routine edits stay muted (the prototype's use).
function toneOf(e: EmployeeHistoryEntry): Tone {
  const k = `${e.resource}:${e.action}`;
  if (k === 'employee:create') return 'primary';
  if (k === 'employee:terminate' || k === 'document:delete') return 'error';
  if (k === 'document:quarantine') return 'warning';
  if (k === 'document:confirm' || k === 'employee:gro-completion') return 'success';
  if (k === 'gro-process:create' || k === 'employee-user:invite') return 'info';
  return 'muted';
}

export function HistoryTab({ employeeId }: { employeeId: string }) {
  const t = useTranslations('person.history');
  const tg = useTranslations('gro');
  const tr = useTranslations('roles');
  const messages = useMessages() as {
    person?: { history?: { action?: Record<string, Record<string, string>> } };
  };
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [data, setData] = useState<EmployeeHistoryResponse | null>(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      setData(await apiFetch<EmployeeHistoryResponse>(`/employees/${employeeId}/history`));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('error'));
    }
  }
  useEffect(() => {
    void load();
  }, [employeeId]);

  const when = (iso: string) => {
    const d = new Date(iso);
    const date =
      locale === 'ar'
        ? new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'short', year: 'numeric' }).format(
            d,
          )
        : `${d.getDate()} ${new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d)} ${d.getFullYear()}`;
    const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(d);
    return `${date} · ${time}`;
  };
  const known = messages.person?.history?.action ?? {};
  const title = (e: EmployeeHistoryEntry) => {
    const base = known[e.resource]?.[e.action]
      ? t(`action.${e.resource}.${e.action}`)
      : t('fallback', { resource: e.resource, action: e.action });
    if (e.subject?.kind === 'document') return `${base} · ${e.subject.title}`;
    if (e.subject?.kind === 'gro-process') return `${base} · ${tg(`type.${e.subject.type}`)}`;
    if (e.subject?.kind === 'dependant') return `${base} · ${e.subject.name}`;
    return base;
  };
  const roleLabel = (role: string | null) => {
    if (!role) return null;
    try {
      return tr(role);
    } catch {
      return role;
    }
  };
  const actor = (e: EmployeeHistoryEntry) => {
    if (!e.actor) return t('system');
    const role = roleLabel(e.actor.role);
    if (e.actor.name) return role ? t('by', { name: e.actor.name, role }) : e.actor.name;
    return role ? t('byRole', { role }) : t('unknownActor');
  };

  return (
    <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      {error && <LoadError message={error} onRetry={() => void load()} />}
      {!data && !error && (
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-2/3" />
          ))}
        </div>
      )}
      {data && data.entries.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('empty')}</p>
      )}
      {data && data.entries.length > 0 && (
        <ol className="flex flex-col">
          {data.entries.map((e, i) => {
            const last = i === data.entries.length - 1;
            const tone = TONE[toneOf(e)];
            return (
              <li key={e.id} className="flex gap-4">
                <span className="flex w-3 shrink-0 flex-col items-center" aria-hidden>
                  <span
                    className={cn(
                      'mt-[3px] flex size-[18px] shrink-0 items-center justify-center rounded-full',
                      tone.halo,
                    )}
                  >
                    <span className={cn('size-3 rounded-full', tone.dot)} />
                  </span>
                  {!last && <span className="min-h-6 w-px grow bg-border" />}
                </span>
                <span className={cn('flex min-w-0 grow flex-col gap-0.5 pt-1', last ? '' : 'pb-3')}>
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-base leading-[22px] font-medium">{title(e)}</span>
                    <time dateTime={e.at} className="text-sm leading-5 text-muted-foreground">
                      {when(e.at)}
                    </time>
                  </span>
                  <span className="text-sm leading-5 text-muted-foreground">{actor(e)}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {data && (
        <p className="mt-4 border-t pt-3 text-xs leading-4 text-muted-foreground">
          {data.truncated ? `${t('truncated')} ` : ''}
          {t('since')}
        </p>
      )}
    </div>
  );
}
