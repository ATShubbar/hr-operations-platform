'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  CandidateListResponse,
  CandidateResponse,
  VacancyListResponse,
  VacancyResponse,
} from '@hr/contracts';
import { Link, useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useNationalityName } from '@/lib/nationality';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { countsOf, PipelineBars } from '../../hiring/pipeline-bars';
import { COLUMNS, isActive, type Column } from '../../hiring/stages';

// The Client record's Hiring tab (DS-11): this company's slice of the hiring
// board (DS-09) — a bar per board column and the candidates in it — with "Open
// board" to move them. Visa & mobilisation is a real stage since MOB-04b.
// Rejected and withdrawn candidates have left the board, so they are not
// counted here.
//
// The parent renders this only for candidate.read holders; a client manager
// never sees candidates (REC-03, kept in DS-09).

export function HiringTab({ clientId }: { clientId: string }) {
  const t = useTranslations('clients');
  const th = useTranslations('hiring');
  const locale = useLocale();
  const router = useRouter();
  const nationalityName = useNationalityName(locale);
  const [candidates, setCandidates] = useState<CandidateResponse[] | null>(null);
  const [vacancies, setVacancies] = useState<VacancyResponse[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<CandidateListResponse>('/candidates'),
      apiFetch<VacancyListResponse>(`/vacancies?clientId=${clientId}`).catch(() => ({
        vacancies: [],
      })),
    ])
      .then(([c, v]) => {
        // In board order, so the list reads like the columns beside it.
        const order = (x: CandidateResponse) => COLUMNS.indexOf(x.stage as Column);
        setCandidates(
          c.candidates
            .filter((x) => x.clientId === clientId && isActive(x.stage))
            .sort((a, b) => order(a) - order(b)),
        );
        setVacancies(v.vacancies);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
        setCandidates([]);
        setError(t('hiringError'));
      });
  }, [clientId]);

  const pool = candidates ?? [];
  const role = (c: CandidateResponse) => {
    const v = vacancies.find((x) => x.id === c.vacancyId);
    return v ? (locale === 'ar' ? v.title.ar : v.title.en) : '';
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr]">
      <section
        aria-labelledby="client-pipeline"
        className="flex flex-col gap-3 rounded-xl bg-card px-5 py-[18px] ring-1 ring-foreground/10"
      >
        <div className="flex flex-col gap-0.5">
          <h2 id="client-pipeline" className="text-base leading-6 font-medium">
            {t('pipeline')}
          </h2>
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {t('pipelineSummary', { count: pool.length })}
          </p>
        </div>
        <PipelineBars counts={countsOf(pool)} />
        <div className="flex pt-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/hiring" />}>
            {t('openBoard')}
          </Button>
        </div>
      </section>

      <section
        aria-labelledby="client-candidates"
        className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
      >
        <h2 id="client-candidates" className="px-5 py-4 text-base leading-6 font-medium">
          {t('candidates')}
        </h2>
        {error && (
          <p role="alert" className="border-t px-5 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {candidates !== null && pool.length === 0 && !error && (
          <p className="border-t px-5 py-7 text-center text-[13px] leading-[18px] text-neutral-400">
            {t('candidatesEmpty')}
          </p>
        )}
        <ul>
          {pool.map((c) => {
            const name = locale === 'ar' ? c.name.ar : c.name.en;
            return (
              <li key={c.id} className="flex items-center gap-2.5 border-t px-5 py-3">
                <Avatar name={c.name.en} size="sm" />
                <span className="flex min-w-0 grow flex-col gap-px">
                  <span className="truncate text-[13px] leading-[18px] font-medium">{name}</span>
                  <span className="truncate text-[11px] leading-[15px] text-muted-foreground">
                    {[role(c), nationalityName(c.nationality)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <Badge variant="outline" className="shrink-0">
                  {th(`column.${c.stage as Column}`)}
                </Badge>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
