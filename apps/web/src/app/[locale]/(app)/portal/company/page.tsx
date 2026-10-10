'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { ClientResponse } from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { dualDate, type Locale } from '@/lib/employee-format';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError } from '@/components/ui/load-state';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { toneFor } from '@/lib/status-tone';
import { BandPill, ProfileLine } from '@/components/client-profile-bits';
import { ProfileRecords } from '../../clients/[id]/profile-records';
import { ServicePanel } from '../../clients/service-panel';

// Client portal — company profile (PORTAL-04) over GET /portal/company. A rep
// sees only their OWN company — since PROF-05 (ADR-019) its whole profile,
// read-only: the Nitaqat band and what it means, the service facts, the main
// contact, signatories, registrations and portals. They change something by
// raising a request. When self-service is disabled for the client the
// API returns 403 — shown here as a calm "not enabled" state, not an error.
export default function PortalCompanyPage() {
  const t = useTranslations('portal');
  const tc = useTranslations('clients');
  // Skeleton and error-state copy lives in one shared namespace: a per-screen
  // `loading` key silently announced "calendar.loading" to screen readers when
  // the namespace happened not to define one (UX-06).
  const tStates = useTranslations('states');
  const locale = useLocale() as Locale;
  const router = useRouter();

  const [company, setCompany] = useState<ClientResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState('');

  // A callable loader (UX-06): the retry has to re-run this in place, which an
  // inline effect body cannot offer.
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setCompany(await apiFetch<ClientResponse>('/portal/company'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login');
        return;
      }
      // 403 here is the self-service flag being off for this client — a state,
      // not a failure, so it gets no retry.
      if (err instanceof ApiError && err.status === 403) setDisabled(true);
      else setError(t('error'));
    } finally {
      setLoading(false);
    }
  }, [router, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('company.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('company.subtitle')}</p>
      </div>

      {disabled && <EmptyState variant="restricted" title={t('notEnabled')} />}
      {error && (
        <LoadError message={error} onRetry={() => void load()} hasContent={Boolean(company)} />
      )}

      {company && (
        <div className="flex max-w-[1040px] flex-col gap-4">
          <div className="flex flex-col gap-[3px] rounded-xl bg-card px-5 py-[18px] ring-1 ring-foreground/10">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-[22px] leading-[30px] font-semibold tracking-[-0.01em]">
                {company.name.en}
              </h2>
              <BandPill band={company.nitaqat?.band} />
              {company.status !== 'active' && (
                <StatusPill tone={toneFor('client', company.status)}>
                  {t(`company.statusValue.${company.status}`)}
                </StatusPill>
              )}
            </div>
            <span
              dir="rtl"
              className="w-fit text-end text-[13px] leading-[18px] text-muted-foreground"
            >
              {company.name.ar}
            </span>
            <ProfileLine client={company} className="text-[13px] leading-[18px]" />
            {company.nitaqat && (
              <p className="pt-2 text-[13px] leading-[18px] text-pretty text-muted-foreground">
                {tc(
                  `nitaqatNote.${
                    company.nitaqat.band === 'red' || company.nitaqat.band === 'yellow'
                      ? company.nitaqat.band
                      : 'clear'
                  }`,
                )}
              </p>
            )}
            <p className="pt-1 text-xs leading-4 text-muted-foreground">
              {t('company.since')}: {dualDate(company.createdAt, locale)}
            </p>
          </div>
          {/* Read-only here: a client manager holds no `client.update`, so the
              cards offer no Edit, and the panel is given nothing to save to. */}
          <ServicePanel client={company} />
          <ProfileRecords client={company} onSaved={setCompany} />
          <p className="text-xs leading-4 text-muted-foreground">{t('company.changeNote')}</p>
        </div>
      )}

      {loading && !company && !disabled && !error && (
        <SkeletonRegion label={tStates('loading')} className="max-w-md rounded-lg border p-6">
          <Skeleton className="mb-2 h-3 w-24" />
          <Skeleton className="mb-6 h-5 w-48" />
          <Skeleton className="mb-2 h-3 w-24" />
          <Skeleton className="mb-6 h-5 w-24" />
          <Skeleton className="mb-2 h-3 w-24" />
          <Skeleton className="h-5 w-40" />
        </SkeletonRegion>
      )}
    </div>
  );
}
