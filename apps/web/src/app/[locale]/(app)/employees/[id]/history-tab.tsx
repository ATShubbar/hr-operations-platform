'use client';

import { useEffect, useState } from 'react';
import { useLocale, useMessages, useTranslations } from 'next-intl';
import type {
  ClientListResponse,
  PersonHistoryEntry,
  PersonHistoryResponse,
  StaffDirectoryResponse,
} from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import type { Locale } from '@/lib/employee-format';
import { changesOf } from '@/lib/audit-changes';
import { cn } from '@/lib/utils';
import { ChangeList, useChangeFormat } from '@/components/change-list';
import { LoadError } from '@/components/ui/load-state';
import { Skeleton } from '@/components/ui/skeleton';
import { dateFormat } from '@/lib/dates';
import { dots } from '@/lib/pieces';

// The Person record's History tab (AUDIT-06) — the prototype's Timeline over
// GET /employees/:id/history: what happened on this person's record, their
// self-service account, their documents and their GRO processes, newest first.
//
// HIST-01 (ADR-022): each event also lists WHAT CHANGED, old → new — the fields
// the API judged this reader may see (pay with salary.read, ID fields with
// govdata.read, an account's details with employee-user.read). When something
// was left out, the event says which kind. Entries from before AUDIT-06 carry no
// record id and are absent, and entries from before 12 Oct 2026 recorded few
// values; the tab says so rather than implying the record has no past.

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
function toneOf(e: PersonHistoryEntry): Tone {
  const k = `${e.resource}:${e.action}`;
  if (k === 'employee:create') return 'primary';
  if (k === 'employee:terminate' || k === 'document:delete') return 'error';
  if (k === 'document:quarantine') return 'warning';
  if (k === 'document:confirm' || k === 'employee:gro-completion') return 'success';
  if (k === 'gro-process:create' || k === 'employee-user:invite') return 'info';
  if (k === 'gro-sequence:start') return 'info';
  if (k === 'gro-sequence:file-step' || k === 'gro-sequence:complete') return 'success';
  if (k === 'gro-sequence:cancel') return 'warning';
  return 'muted';
}

export function HistoryTab({ employeeId }: { employeeId: string }) {
  const t = useTranslations('person.history');
  const tg = useTranslations('gro');
  const tr = useTranslations('roles');
  const tm = useTranslations('person.mob');
  const messages = useMessages() as {
    person?: {
      history?: { action?: Record<string, Record<string, string>> };
      mob?: { kind?: Record<string, unknown>; step?: Record<string, unknown> };
    };
  };
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [data, setData] = useState<PersonHistoryResponse | null>(null);
  const [error, setError] = useState('');
  // Names for an account or a company that appears in a changed field. Both
  // lists are best-effort: without them the field shows a short id.
  const [people, setPeople] = useState<Map<string, string>>(new Map());
  const [companies, setCompanies] = useState<Map<string, { en: string; ar: string }>>(new Map());
  useEffect(() => {
    apiFetch<StaffDirectoryResponse>('/staff-users/directory')
      .then((r) =>
        setPeople(new Map(r.users.flatMap((u) => (u.displayName ? [[u.id, u.displayName]] : [])))),
      )
      .catch(() => setPeople(new Map()));
    apiFetch<ClientListResponse>('/clients')
      .then((r) => setCompanies(new Map(r.clients.map((c) => [c.id, c.name]))))
      .catch(() => setCompanies(new Map()));
  }, []);
  const format = useChangeFormat({
    userName: (id) => people.get(id) ?? null,
    clientName: (id) => companies.get(id)?.[locale] ?? null,
  });

  async function load() {
    setError('');
    try {
      setData(await apiFetch<PersonHistoryResponse>(`/employees/${employeeId}/history`));
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
        ? dateFormat('ar', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
        : `${d.getDate()} ${dateFormat('en-US', { month: 'short' }).format(d)} ${d.getFullYear()}`;
    const time = dateFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(d);
    return dots(locale, date, time);
  };
  const known = messages.person?.history?.action ?? {};
  const mobKnown = messages.person?.mob ?? {};
  const title = (e: PersonHistoryEntry) => {
    const base = known[e.resource]?.[e.action]
      ? t(`action.${e.resource}.${e.action}`)
      : t('fallback', { resource: e.resource, action: e.action });
    if (e.subject?.kind === 'document') return dots(locale, base, e.subject.title);
    if (e.subject?.kind === 'gro-process') return dots(locale, base, tg(`type.${e.subject.type}`));
    if (e.subject?.kind === 'dependant') return dots(locale, base, e.subject.name);
    if (e.subject?.kind === 'gro-sequence') {
      const label = mobKnown.kind?.[e.subject.sequence]
        ? tm(`kind.${e.subject.sequence}.label`)
        : e.subject.sequence;
      const step =
        e.subject.step && mobKnown.step?.[e.subject.step]
          ? tm(`step.${e.subject.step}.title`)
          : e.subject.step;
      return step ? dots(locale, base, `${step} (${label})`) : dots(locale, base, label);
    }
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
  const actor = (e: PersonHistoryEntry) => {
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
                    <span className="text-base leading-[22px] font-medium">
                      {/* Isolated: an Arabic title holding a Latin word or name is
                          otherwise laid out run by run under the LTR layout. */}
                      <bdi>{title(e)}</bdi>
                    </span>
                    <time dateTime={e.at} className="text-sm leading-5 text-muted-foreground">
                      {when(e.at)}
                    </time>
                  </span>
                  <span className="text-sm leading-5 text-muted-foreground">{actor(e)}</span>
                  <ChangeList
                    format={format}
                    resource={e.resource}
                    changes={changesOf(e.before, e.after)}
                    max={12}
                    className="mt-1.5 max-w-2xl"
                  />
                  {e.withheld.map((kind) => (
                    <span key={kind} className="mt-1 text-xs leading-4 text-muted-foreground">
                      {t(`withheld.${kind}`)}
                    </span>
                  ))}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {data && (
        <p className="mt-4 border-t pt-3 text-xs leading-4 text-muted-foreground">
          {data.truncated ? `${t('truncated')} ` : ''}
          {t('since')} {t('detailsSince')}
        </p>
      )}
    </div>
  );
}
