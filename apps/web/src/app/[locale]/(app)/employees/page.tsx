'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  ClientListResponse,
  ClientResponse,
  EmployeeListResponse,
  EmployeeResponse,
} from '@hr/contracts';
import { Link, useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import {
  CONTRACT_TYPE_KEY,
  CONTRACT_TYPE_VALUES,
  dualDate,
  EMPLOYMENT_STATUS_KEY,
  EMPLOYMENT_STATUS_VALUES,
  GENDER_KEY,
  GENDER_VALUES,
  type Locale,
} from '@/lib/employee-format';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable } from '@/components/ui/data-table';
import { LoadError, NoAccess } from '@/components/ui/load-state';
import { StatusPill } from '@/components/ui/status-pill';
import { toneFor } from '@/lib/status-tone';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CreateForm {
  clientId: string;
  nameEn: string;
  nameAr: string;
  nationality: string;
  contractType: string;
  gender: string;
  jobTitleEn: string;
  jobTitleAr: string;
  department: string;
  hireDate: string;
  employmentStatus: string;
}

const EMPTY_FORM: CreateForm = {
  clientId: '',
  nameEn: '',
  nameAr: '',
  nationality: '',
  contractType: 'unlimited',
  gender: '',
  jobTitleEn: '',
  jobTitleAr: '',
  department: '',
  hireDate: '',
  employmentStatus: 'active',
};

// Employees console (EMP-03) over the employee.* API (EMP-02). The list is
// visible to any employee.read holder; every row is redacted server-side, so
// this page only ever shows core columns. Create is core-only and gated on
// employee.create — salary/govdata are set on the detail page via their own
// per-group endpoints. A 401 means the session lapsed → back to sign-in.
export default function EmployeesPage() {
  const t = useTranslations('employees');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const canCreate = useCan('employee.create');

  const [employees, setEmployees] = useState<EmployeeResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<ClientResponse[]>([]);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<EmployeeListResponse>('/employees');
      setEmployees(res.employees);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login');
        return;
      }
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setError(t('error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Initial load, once on mount.
    void load();
  }, []);

  async function openCreate() {
    setForm(EMPTY_FORM);
    setFormError('');
    setOpen(true);
    try {
      const res = await apiFetch<ClientListResponse>('/clients');
      setClients(res.clients.filter((c) => c.status === 'active'));
    } catch {
      // Non-fatal: the client select will be empty and the form unsubmittable.
      setClients([]);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    const payload: Record<string, unknown> = {
      clientId: form.clientId,
      name: { ar: form.nameAr, en: form.nameEn },
      nationality: form.nationality.toUpperCase(),
      contractType: form.contractType,
      employmentStatus: form.employmentStatus,
    };
    if (form.gender) payload.gender = form.gender;
    if (form.jobTitleEn) payload.jobTitleEn = form.jobTitleEn;
    if (form.jobTitleAr) payload.jobTitleAr = form.jobTitleAr;
    if (form.department) payload.department = form.department;
    if (form.hireDate) payload.hireDate = form.hireDate;
    try {
      const created = await apiFetch<EmployeeResponse>('/employees', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setOpen(false);
      router.push(`/employees/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login');
        return;
      }
      setFormError(t('saveError'));
    } finally {
      setSaving(false);
    }
  }

  const localizedName = (e: EmployeeResponse) => (locale === 'ar' ? e.name.ar : e.name.en);
  const localizedJob = (e: EmployeeResponse) =>
    (locale === 'ar' ? e.jobTitle.ar : e.jobTitle.en) ?? t('none');

  // Deep-linked without the capability: the nav hides the link, a pasted URL does
  // not. A refusal is not a failure, so it replaces the screen and offers no retry.
  if (forbidden) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <NoAccess capability="employee.read" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        {canCreate && <Button onClick={() => void openCreate()}>{t('new')}</Button>}
      </div>

      {error && (
        <LoadError message={error} onRetry={() => void load()} hasContent={employees.length > 0} />
      )}

      {/* UX-03: search (Arabic-aware), sortable columns, pagination and a
          proper empty/no-results split. Employees is the primary entity, so it
          was the worst case of the no-search problem. */}
      <DataTable
        rows={employees}
        loading={loading}
        rowKey={(e) => e.id}
        searchPlaceholder={t('searchPlaceholder')}
        initialSort={{ key: 'name', dir: 'asc' }}
        emptyTitle={t('empty')}
        columns={[
          {
            key: 'name',
            header: t('colName'),
            sortValue: (e) => localizedName(e),
            // Identifiers are searchable even though they are not a column:
            // staff look people up by iqama number, and it would be a poor search
            // that could not find one.
            searchValues: (e) => [e.name.ar, e.name.en, e.govdata?.iqamaNumber, e.govdata?.nationalId],
            cell: (e) => (
              <Link href={`/employees/${e.id}`} className="font-medium hover:underline">
                {localizedName(e)}
              </Link>
            ),
          },
          {
            key: 'nationality',
            header: t('colNationality'),
            sortValue: (e) => e.nationality,
            searchValues: (e) => [e.nationality],
            cell: (e) => e.nationality,
          },
          {
            key: 'jobTitle',
            header: t('colJobTitle'),
            sortValue: (e) => localizedJob(e) ?? '',
            searchValues: (e) => [e.jobTitle.ar, e.jobTitle.en, e.department],
            cell: (e) => localizedJob(e),
          },
          {
            key: 'status',
            header: t('colStatus'),
            sortValue: (e) => e.employmentStatus,
            cell: (e) => (
              <StatusPill tone={toneFor('employee', e.employmentStatus)}>
                {t(EMPLOYMENT_STATUS_KEY[e.employmentStatus])}
              </StatusPill>
            ),
          },
          {
            key: 'hireDate',
            header: t('colHireDate'),
            // Sorts on the raw ISO date, not the rendered dual-calendar string —
            // sorting the display text would order by Hijri month name.
            sortValue: (e) => e.hireDate,
            cell: (e) => (
              <span className="text-sm text-muted-foreground">
                {dualDate(e.hireDate, locale) ?? t('none')}
              </span>
            ),
          },
        ]}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('createTitle')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('client')}</Label>
              <Select
                value={form.clientId}
                onValueChange={(v) => setForm({ ...form, clientId: v ?? '' })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('selectClient')} />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {locale === 'ar' ? c.name.ar : c.name.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="nameEn">{t('nameEn')}</Label>
                <Input
                  id="nameEn"
                  value={form.nameEn}
                  onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nameAr">{t('nameAr')}</Label>
                <Input
                  id="nameAr"
                  dir="rtl"
                  value={form.nameAr}
                  onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nationality">{t('fieldNationality')}</Label>
                <Input
                  id="nationality"
                  value={form.nationality}
                  onChange={(e) => setForm({ ...form, nationality: e.target.value })}
                  maxLength={2}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('fieldContractType')}</Label>
                <Select
                  value={form.contractType}
                  onValueChange={(v) => setForm({ ...form, contractType: v ?? '' })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTRACT_TYPE_VALUES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {t(CONTRACT_TYPE_KEY[v])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t('fieldGender')}</Label>
                <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v ?? '' })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('none')} />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDER_VALUES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {t(GENDER_KEY[v])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t('fieldEmploymentStatus')}</Label>
                <Select
                  value={form.employmentStatus}
                  onValueChange={(v) => setForm({ ...form, employmentStatus: v ?? '' })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT_STATUS_VALUES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {t(EMPLOYMENT_STATUS_KEY[v])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="jobTitleEn">{t('fieldJobTitleEn')}</Label>
                <Input
                  id="jobTitleEn"
                  value={form.jobTitleEn}
                  onChange={(e) => setForm({ ...form, jobTitleEn: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="jobTitleAr">{t('fieldJobTitleAr')}</Label>
                <Input
                  id="jobTitleAr"
                  dir="rtl"
                  value={form.jobTitleAr}
                  onChange={(e) => setForm({ ...form, jobTitleAr: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="department">{t('fieldDepartment')}</Label>
                <Input
                  id="department"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hireDate">{t('fieldHireDate')}</Label>
                <Input
                  id="hireDate"
                  type="date"
                  value={form.hireDate}
                  onChange={(e) => setForm({ ...form, hireDate: e.target.value })}
                />
              </div>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={saving || !form.clientId}>
                {saving ? t('saving') : t('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
