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

// Client portal — company profile (PORTAL-04) over GET /portal/company. A rep
// sees only their OWN company. When self-service is disabled for the client the
// API returns 403 — shown here as a calm "not enabled" state, not an error.
export default function PortalCompanyPage() {
  const t = useTranslations('portal');
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
        <div className="max-w-md rounded-lg border p-6">
          <dl className="space-y-4">
            <div>
              <dt className="text-sm text-muted-foreground">{t('company.name')}</dt>
              <dd className="text-lg font-medium">
                {locale === 'ar' ? company.name.ar : company.name.en}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t('company.status')}</dt>
              <dd className="mt-1">
                <StatusPill tone={toneFor('client', company.status)}>
                  {t(`company.statusValue.${company.status}`)}
                </StatusPill>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t('company.since')}</dt>
              <dd className="text-sm">{dualDate(company.createdAt, locale)}</dd>
            </div>
          </dl>
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
