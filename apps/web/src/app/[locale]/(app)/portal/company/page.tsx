'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { ClientResponse } from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { dualDate, type Locale } from '@/lib/employee-format';
import { Badge } from '@/components/ui/badge';

// Client portal — company profile (PORTAL-04) over GET /portal/company. A rep
// sees only their OWN company. When self-service is disabled for the client the
// API returns 403 — shown here as a calm "not enabled" state, not an error.
export default function PortalCompanyPage() {
  const t = useTranslations('portal');
  const locale = useLocale() as Locale;
  const router = useRouter();

  const [company, setCompany] = useState<ClientResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiFetch<ClientResponse>('/portal/company')
      .then((c) => {
        if (active) setCompany(c);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/login');
          return;
        }
        if (err instanceof ApiError && err.status === 403) setDisabled(true);
        else setError(t('error'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router, t]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('company.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('company.subtitle')}</p>
      </div>

      {disabled && <p className="text-sm text-muted-foreground">{t('notEnabled')}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

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
                <Badge variant={company.status === 'active' ? 'default' : 'secondary'}>
                  {t(`company.statusValue.${company.status}`)}
                </Badge>
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
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      )}
    </div>
  );
}
