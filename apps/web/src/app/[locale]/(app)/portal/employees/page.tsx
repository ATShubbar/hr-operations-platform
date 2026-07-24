'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { EmployeeListResponse, EmployeeResponse } from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { dualDate, EMPLOYMENT_STATUS_KEY, type Locale } from '@/lib/employee-format';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('employees.colName')}</TableHead>
                <TableHead>{t('employees.colJobTitle')}</TableHead>
                <TableHead>{t('employees.colDepartment')}</TableHead>
                <TableHead>{t('employees.colStatus')}</TableHead>
                <TableHead>{t('employees.colIqamaExpiry')}</TableHead>
                <TableHead>{t('employees.colWorkPermitExpiry')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">
                    {locale === 'ar' ? e.name.ar : e.name.en}
                  </TableCell>
                  <TableCell>
                    {(locale === 'ar' ? e.jobTitle.ar : e.jobTitle.en) ?? t('employees.none')}
                  </TableCell>
                  <TableCell>{e.department ?? t('employees.none')}</TableCell>
                  <TableCell>
                    <Badge variant={e.employmentStatus === 'active' ? 'default' : 'secondary'}>
                      {t(`employees.${EMPLOYMENT_STATUS_KEY[e.employmentStatus]}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {dualDate(e.govdata?.iqamaExpiry ?? null, locale) ?? t('employees.none')}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {dualDate(e.govdata?.workPermitExpiry ?? null, locale) ?? t('employees.none')}
                  </TableCell>
                </TableRow>
              ))}
              {employees.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    {t('employees.empty')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
