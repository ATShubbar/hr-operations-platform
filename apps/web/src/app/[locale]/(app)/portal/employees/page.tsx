'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { EmployeeListResponse, EmployeeResponse } from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { dualDate, EMPLOYMENT_STATUS_KEY, type Locale } from '@/lib/employee-format';
import { DataTable } from '@/components/ui/data-table';
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

  useEffect(() => {
    let active = true;
    apiFetch<EmployeeListResponse>('/portal/employees')
      .then((res) => {
        if (active) setEmployees(res.employees);
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
        <h1 className="text-2xl font-semibold">{t('employees.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('employees.subtitle')}</p>
      </div>

      {disabled && <p className="text-sm text-muted-foreground">{t('notEnabled')}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

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
