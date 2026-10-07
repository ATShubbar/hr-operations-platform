'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { SelfDependant, SelfDependantListResponse } from '@hr/contracts';
import { formatHijri } from '@hr/dates';
import { apiFetch } from '@/lib/api';
import { chipClass, daysTo } from '@/lib/employee-docs';
import type { Locale } from '@/lib/employee-format';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

// My family (DEP-04, ADR-017) — the dependants on my sponsorship, read-only, in
// the Family tab's card shape (DEP-03), phone-first. The numbers are mine to see
// (ADR-011: one's own identifiers, with numbers); GET /me/dependants is fenced
// to this employee by the database (DEP-02). Nothing here changes data: a
// correction goes through a request, as for the rest of My file.

const DOCS = [
  { key: 'iqama', field: 'iqamaExpiry' },
  { key: 'passport', field: 'passportExpiry' },
  { key: 'insurance', field: 'insuranceExpiry' },
] as const;

function ageOf(iso: string): number {
  const born = new Date(`${iso}T00:00:00Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const m = now.getUTCMonth() - born.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < born.getUTCDate())) age -= 1;
  return age;
}
const grouped = (n: string) =>
  n.length === 10 ? `${n[0]} ${n.slice(1, 4)} ${n.slice(4, 7)} ${n.slice(7)}` : n;

export function FamilySection({ onRequestChange }: { onRequestChange: () => void }) {
  const t = useTranslations('me.family');
  const tf = useTranslations('person.family');
  const tp = useTranslations('people');
  const locale = useLocale() as Locale;
  const [rows, setRows] = useState<SelfDependant[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiFetch<SelfDependantListResponse>('/me/dependants')
      .then((r) => setRows(r.dependants))
      .catch(() => setFailed(true));
  }, []);

  // A failure here never takes the rest of My file down with it.
  if (failed) return null;

  const day = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    if (locale === 'ar') {
      return new Intl.DateTimeFormat('ar', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(d);
    }
    const month = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(d);
    return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
  };
  const chipText = (days: number) =>
    days < 0 ? tp('over', { n: Math.abs(days) }) : tp('left', { n: days });

  return (
    <section
      aria-labelledby="me-family"
      className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
    >
      <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
        <span className="flex min-w-0 grow flex-col gap-px">
          <h2 id="me-family" className="text-base leading-6 font-medium">
            {t('title')}
          </h2>
          <span className="text-xs leading-4 text-muted-foreground">
            <bdi>
              {rows === null
                ? ''
                : rows.length === 0
                  ? t('none')
                  : tf('summary', { count: rows.length })}
            </bdi>
          </span>
        </span>
        <Button variant="outline" size="sm" className="shrink-0" onClick={onRequestChange}>
          {t('requestChange')}
        </Button>
      </div>

      {rows?.map((d) => (
        <div key={d.id} className="border-t">
          <div className="flex items-center gap-3 px-5 py-3">
            <Avatar name={d.nameEn} size="md" />
            <span className="flex min-w-0 grow flex-col gap-px">
              <span className="truncate text-sm leading-5 font-medium">{d.nameEn}</span>
              {d.nameAr && (
                <span dir="rtl" className="w-fit truncate text-xs leading-4 text-muted-foreground">
                  {d.nameAr}
                </span>
              )}
            </span>
            <span className="flex shrink-0 flex-col items-end gap-px">
              <span className="text-xs leading-4 text-muted-foreground">
                {tf(`relationship.${d.relationship}`)} ·{' '}
                {d.dateOfBirth ? tf('age', { n: ageOf(d.dateOfBirth) }) : tf('ageUnknown')}
              </span>
              {d.iqamaNumber ? (
                <bdi dir="ltr" className="font-mono text-[11px] leading-[15px]">
                  {grouped(d.iqamaNumber)}
                </bdi>
              ) : (
                <span className="text-[11px] leading-[15px] text-neutral-400">
                  {tf('notIssued')}
                </span>
              )}
            </span>
          </div>
          <ul>
            {DOCS.map((doc) => {
              const iso = d[doc.field];
              const days = iso ? daysTo(iso) : null;
              return (
                <li key={doc.key} className="flex min-h-11 items-center gap-3 border-t px-5 py-1.5">
                  <span className="flex min-w-0 grow flex-col">
                    <span className="text-[13px] leading-[18px]">{tf(`doc.${doc.key}`)}</span>
                    {iso ? (
                      <span className="text-[11px] leading-[15px] text-muted-foreground">
                        {day(iso)} · {formatHijri(new Date(`${iso}T00:00:00Z`), locale)}
                      </span>
                    ) : (
                      <span className="text-[11px] leading-[15px] text-neutral-400">
                        {tf('notOnFile')}
                      </span>
                    )}
                  </span>
                  {days !== null && (
                    <span
                      className={cn(
                        'inline-flex h-5 shrink-0 items-center rounded-full px-2 font-mono text-[11px] leading-5 whitespace-nowrap',
                        chipClass(days),
                      )}
                    >
                      {chipText(days)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
