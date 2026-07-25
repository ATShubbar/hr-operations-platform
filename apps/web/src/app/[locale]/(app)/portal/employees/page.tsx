'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { EmployeeListResponse, EmployeeResponse } from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { dualDate, EMPLOYMENT_STATUS_KEY, type Locale } from '@/lib/employee-format';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError } from '@/components/ui/load-state';
import { StatusPill } from '@/components/ui/status-pill';
import { toneFor } from '@/lib/status-tone';

// Client portal — employees (PORTAL-04) over GET /portal/employees. The rep sees
// only their OWN employees, redacted to core + government STATUS/EXPIRY: no
// salary, no government identifier numbers (the API redacts them; this table
// simply has no such columns). 403 → self-service not enabled.
export default function PortalEmployeesPage() {
  const t = useTranslations('portal');
  const locale = useLocale() as Locale;
  const router = useRouter();

  const [employees, setEmployees] = useState<EmployeeResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState('');

  // Callable so the error state can retry in place (UX-06).
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<EmployeeListResponse>('/portal/employees');
      setEmployees(res.employees);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login');
        return;
      }
      // 403 = self-service off for this client. A state, not a failure: no retry.
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
        <h1 className="text-2xl font-semibold">{t('employees.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('employees.subtitle')}</p>
      </div>

      {disabled && <EmptyState variant="restricted" title={t('notEnabled')} />}
      {error && <LoadError message={error} onRetry={() => void load()} hasContent={employees.length > 0} />}

      {!disabled && !error && (
        <DataTable
          rows={employees}
          loading={loading}
          rowKey={(e) => e.id}
          searchPlaceholder={t('employees.searchPlaceholder')}
          initialSort={{ key: 'name', dir: 'asc' }}
          emptyTitle={t('employees.empty')}
          columns={[
            {
              key: 'name',
              header: t('employees.colName'),
              sortValue: (e) => (locale === 'ar' ? e.name.ar : e.name.en),
              searchValues: (e) => [e.name.ar, e.name.en],
              cell: (e) => (
                <span className="font-medium">{locale === 'ar' ? e.name.ar : e.name.en}</span>
              ),
            },
            {
              key: 'jobTitle',
              header: t('employees.colJobTitle'),
              sortValue: (e) => (locale === 'ar' ? e.jobTitle.ar : e.jobTitle.en) ?? '',
              searchValues: (e) => [e.jobTitle.ar, e.jobTitle.en, e.department],
              cell: (e) =>
                (locale === 'ar' ? e.jobTitle.ar : e.jobTitle.en) ?? t('employees.none'),
            },
            {
              key: 'department',
              header: t('employees.colDepartment'),
              sortValue: (e) => e.department ?? '',
              cell: (e) => e.department ?? t('employees.none'),
            },
            {
              key: 'status',
              header: t('employees.colStatus'),
              sortValue: (e) => e.employmentStatus,
              cell: (e) => (
                <StatusPill tone={toneFor('employee', e.employmentStatus)}>
                  {t(`employees.${EMPLOYMENT_STATUS_KEY[e.employmentStatus]}`)}
                </StatusPill>
              ),
            },
            {
              key: 'iqamaExpiry',
              header: t('employees.colIqamaExpiry'),
              sortValue: (e) => e.govdata?.iqamaExpiry,
              cell: (e) => (
                <span className="whitespace-nowrap text-sm text-muted-foreground">
                  {dualDate(e.govdata?.iqamaExpiry ?? null, locale) ?? t('employees.none')}
                </span>
              ),
            },
            {
              key: 'workPermitExpiry',
              header: t('employees.colWorkPermitExpiry'),
              sortValue: (e) => e.govdata?.workPermitExpiry,
              cell: (e) => (
                <span className="whitespace-nowrap text-sm text-muted-foreground">
                  {dualDate(e.govdata?.workPermitExpiry ?? null, locale) ?? t('employees.none')}
                </span>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
