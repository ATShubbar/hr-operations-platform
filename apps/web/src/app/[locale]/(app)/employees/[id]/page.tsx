'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { EmployeeResponse } from '@hr/contracts';
import { Link, useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import {
  CONTRACT_TYPE_KEY,
  CONTRACT_TYPE_VALUES,
  dualDate,
  EMPLOYMENT_STATUS_KEY,
  EMPLOYMENT_STATUS_VALUES,
  EXIT_REENTRY_KEY,
  EXIT_REENTRY_VALUES,
  GENDER_KEY,
  GENDER_VALUES,
  GOSI_BASIS_KEY,
  GOSI_BASIS_VALUES,
  GOSI_REG_KEY,
  GOSI_REG_VALUES,
  toDateInput,
  WPS_KEY,
  WPS_VALUES,
  type Locale,
} from '@/lib/employee-format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type DialogKind = 'core' | 'salary' | 'govdata' | null;

// Employee detail (EMP-03). The three sensitivity groups render as separate
// cards: `salary`/`govdata` come back `null` from the API when the caller lacks
// salary.read / govdata.read — so this page shows a "restricted" notice for a
// redacted group rather than empty fields. Edit affordances are gated by
// capability (useCan); the server is the real gate, this only hides the buttons.
// Each group's edit posts to its OWN endpoint (per-group permission).
export default function EmployeeDetailPage() {
  const t = useTranslations('employees');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const canEditCore = useCan('employee.update');
  const canEditSalary = useCan('salary.update');
  const canEditGovdata = useCan('govdata.update');
  const canTerminate = useCan('employee.delete');

  const [emp, setEmp] = useState<EmployeeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [terminating, setTerminating] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<EmployeeResponse>(`/employees/${id}`);
      setEmp(res);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login');
        return;
      }
      setError(err instanceof ApiError && err.status === 404 ? t('notFound') : t('error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Reload whenever the route id changes.
    void load();
  }, [id]);

  async function terminate() {
    if (!emp || !window.confirm(t('confirmTerminate'))) return;
    setTerminating(true);
    try {
      const res = await apiFetch<EmployeeResponse>(`/employees/${emp.id}`, { method: 'DELETE' });
      setEmp(res);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login');
        return;
      }
      setError(t('saveError'));
    } finally {
      setTerminating(false);
    }
  }

  const onSaved = (updated: EmployeeResponse) => {
    setEmp(updated);
    setDialog(null);
  };

  if (loading) return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  if (error || !emp) {
    return (
      <div className="space-y-4">
        <BackLink t={t} />
        <p className="text-sm text-destructive">{error || t('notFound')}</p>
      </div>
    );
  }

  const name = locale === 'ar' ? emp.name.ar : emp.name.en;
  const job = (locale === 'ar' ? emp.jobTitle.ar : emp.jobTitle.en) ?? t('none');

  return (
    <div className="space-y-6">
      <BackLink t={t} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{name}</h1>
          <p className="text-sm text-muted-foreground">
            {job} · {emp.nationality}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={emp.employmentStatus === 'active' ? 'default' : 'secondary'}>
            {t(EMPLOYMENT_STATUS_KEY[emp.employmentStatus])}
          </Badge>
          {canTerminate && emp.employmentStatus !== 'terminated' && (
            <Button variant="outline" size="sm" onClick={() => void terminate()} disabled={terminating}>
              {terminating ? t('terminating') : t('terminate')}
            </Button>
          )}
        </div>
      </div>

      {/* ---- Core ---- */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t('sectionCore')}</CardTitle>
          {canEditCore && (
            <CardAction>
              <Button variant="outline" size="sm" onClick={() => setDialog('core')}>
                {t('edit')}
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          <Field label={t('fieldGender')} value={emp.gender ? t(GENDER_KEY[emp.gender]) : null} />
          <Field label={t('fieldDepartment')} value={emp.department} />
          <Field label={t('fieldJobTitleEn')} value={emp.jobTitle.en} />
          <Field label={t('fieldJobTitleAr')} value={emp.jobTitle.ar} />
          <Field label={t('fieldContractType')} value={t(CONTRACT_TYPE_KEY[emp.contractType])} />
          <Field label={t('fieldHireDate')} value={dualDate(emp.hireDate, locale)} />
          <Field label={t('fieldContractEndDate')} value={dualDate(emp.contractEndDate, locale)} />
          <Field label={t('fieldDateOfBirth')} value={dualDate(emp.dateOfBirth, locale)} />
          <Field
            label={t('fieldSaudization')}
            value={
              emp.countsTowardSaudization == null
                ? null
                : emp.countsTowardSaudization
                  ? t('yes')
                  : t('no')
            }
          />
        </CardContent>
      </Card>

      {/* ---- Salary (redaction reflected) ---- */}
      <GroupCard
        title={t('sectionSalary')}
        redacted={emp.salary === null}
        restrictedLabel={t('restricted')}
        canEdit={canEditSalary && emp.salary !== null}
        editLabel={t('edit')}
        onEdit={() => setDialog('salary')}
      >
        {emp.salary && (
          <CardContent className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            <Field label={t('fieldBasicSalary')} value={money(emp.salary.basicSalary, emp.salary.currency)} />
            <Field label={t('fieldHousing')} value={money(emp.salary.housingAllowance, emp.salary.currency)} />
            <Field label={t('fieldTransport')} value={money(emp.salary.transportAllowance, emp.salary.currency)} />
            <Field label={t('fieldOther')} value={money(emp.salary.otherAllowances, emp.salary.currency)} />
            <Field label={t('fieldGosiWage')} value={money(emp.salary.gosiWage, emp.salary.currency)} />
            <Field
              label={t('fieldGosiBasis')}
              value={emp.salary.gosiContributionBasis ? t(GOSI_BASIS_KEY[emp.salary.gosiContributionBasis]) : null}
            />
            <Field label={t('fieldIban')} value={emp.salary.bankIban} mono />
            <Field label={t('fieldWps')} value={emp.salary.wpsStatus ? t(WPS_KEY[emp.salary.wpsStatus]) : null} />
          </CardContent>
        )}
      </GroupCard>

      {/* ---- Government data (redaction reflected) ---- */}
      <GroupCard
        title={t('sectionGovdata')}
        redacted={emp.govdata === null}
        restrictedLabel={t('restricted')}
        canEdit={canEditGovdata && emp.govdata !== null}
        editLabel={t('edit')}
        onEdit={() => setDialog('govdata')}
      >
        {emp.govdata && (
          <CardContent className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            <Field label={t('fieldIqama')} value={emp.govdata.iqamaNumber} mono />
            <Field label={t('fieldIqamaExpiry')} value={dualDate(emp.govdata.iqamaExpiry, locale)} />
            <Field label={t('fieldNationalId')} value={emp.govdata.nationalId} mono />
            <Field label={t('fieldBorder')} value={emp.govdata.borderNumber} mono />
            <Field label={t('fieldPassport')} value={emp.govdata.passportNumber} mono />
            <Field label={t('fieldPassportExpiry')} value={dualDate(emp.govdata.passportExpiry, locale)} />
            <Field label={t('fieldWorkPermit')} value={emp.govdata.workPermitNumber} mono />
            <Field label={t('fieldWorkPermitExpiry')} value={dualDate(emp.govdata.workPermitExpiry, locale)} />
            <Field label={t('fieldGosiRegNo')} value={emp.govdata.gosiRegistrationNumber} mono />
            <Field
              label={t('fieldGosiRegStatus')}
              value={emp.govdata.gosiRegistrationStatus ? t(GOSI_REG_KEY[emp.govdata.gosiRegistrationStatus]) : null}
            />
            <Field label={t('fieldAbsher')} value={emp.govdata.absherServiceRef} mono />
            <Field
              label={t('fieldExitReentry')}
              value={emp.govdata.exitReentryStatus ? t(EXIT_REENTRY_KEY[emp.govdata.exitReentryStatus]) : null}
            />
            <Field label={t('fieldExitReentryExpiry')} value={dualDate(emp.govdata.exitReentryExpiry, locale)} />
          </CardContent>
        )}
      </GroupCard>

      {dialog === 'core' && <CoreDialog emp={emp} onClose={() => setDialog(null)} onSaved={onSaved} />}
      {dialog === 'salary' && emp.salary && (
        <SalaryDialog emp={emp} onClose={() => setDialog(null)} onSaved={onSaved} />
      )}
      {dialog === 'govdata' && emp.govdata && (
        <GovdataDialog emp={emp} onClose={() => setDialog(null)} onSaved={onSaved} />
      )}
    </div>
  );
}

// ---------- presentational ----------

function BackLink({ t }: { t: (k: string) => string }) {
  return (
    <Link href="/employees" className="text-sm text-muted-foreground hover:underline">
      {t('backToList')}
    </Link>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={mono ? 'font-mono text-sm' : 'text-sm'}>{value ?? '—'}</div>
    </div>
  );
}

function GroupCard({
  title,
  redacted,
  restrictedLabel,
  canEdit,
  editLabel,
  onEdit,
  children,
}: {
  title: string;
  redacted: boolean;
  restrictedLabel: string;
  canEdit: boolean;
  editLabel: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
        {canEdit && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={onEdit}>
              {editLabel}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      {redacted ? (
        <CardContent>
          <p className="text-sm text-muted-foreground">🔒 {restrictedLabel}</p>
        </CardContent>
      ) : (
        children
      )}
    </Card>
  );
}

function money(n: number | null, currency: string): string | null {
  if (n == null) return null;
  return `${n.toLocaleString()} ${currency}`;
}

// ---------- edit dialogs ----------

interface DialogProps {
  emp: EmployeeResponse;
  onClose: () => void;
  onSaved: (updated: EmployeeResponse) => void;
}

function useSaver(onSaved: (u: EmployeeResponse) => void) {
  const t = useTranslations('employees');
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  async function submit(url: string, body: Record<string, unknown>) {
    setSaving(true);
    setErr('');
    try {
      const res = await apiFetch<EmployeeResponse>(url, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      onSaved(res);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.replace('/login');
        return;
      }
      setErr(t('saveError'));
    } finally {
      setSaving(false);
    }
  }
  return { saving, err, submit };
}

// small controlled helpers used by the dialogs
function TextField({
  label,
  value,
  onChange,
  dir,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  dir?: 'rtl';
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} dir={dir} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" step="0.01" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  labelFor,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly T[];
  labelFor: (v: T) => string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? '')}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((v) => (
            <SelectItem key={v} value={v}>
              {labelFor(v)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// send a text value: '' clears (sent as empty), undefined omits. For optional
// text we send the string as-is (empty allowed by the schema).
const numOrSkip = (s: string, out: Record<string, unknown>, key: string) => {
  if (s.trim() !== '') out[key] = Number(s);
};
const dateOrSkip = (s: string, out: Record<string, unknown>, key: string) => {
  if (s !== '') out[key] = s;
};

function CoreDialog({ emp, onClose, onSaved }: DialogProps) {
  const t = useTranslations('employees');
  const { saving, err, submit } = useSaver((u) => onSaved(u));
  const [f, setF] = useState({
    nameEn: emp.name.en,
    nameAr: emp.name.ar,
    nationality: emp.nationality,
    gender: emp.gender ?? '',
    jobTitleEn: emp.jobTitle.en ?? '',
    jobTitleAr: emp.jobTitle.ar ?? '',
    department: emp.department ?? '',
    hireDate: toDateInput(emp.hireDate),
    contractType: emp.contractType,
    contractEndDate: toDateInput(emp.contractEndDate),
    employmentStatus: emp.employmentStatus,
  });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {
      name: { ar: f.nameAr, en: f.nameEn },
      nationality: f.nationality.toUpperCase(),
      contractType: f.contractType,
      employmentStatus: f.employmentStatus,
      jobTitleEn: f.jobTitleEn,
      jobTitleAr: f.jobTitleAr,
      department: f.department,
    };
    if (f.gender) body.gender = f.gender;
    dateOrSkip(f.hireDate, body, 'hireDate');
    dateOrSkip(f.contractEndDate, body, 'contractEndDate');
    void submit(`/employees/${emp.id}`, body);
  }

  return (
    <EditDialog title={t('editCoreTitle')} onClose={onClose} onSubmit={onSubmit} saving={saving} err={err}>
      <TextField label={t('nameEn')} value={f.nameEn} onChange={set('nameEn')} />
      <TextField label={t('nameAr')} value={f.nameAr} onChange={set('nameAr')} dir="rtl" />
      <TextField label={t('fieldNationality')} value={f.nationality} onChange={set('nationality')} />
      <SelectField label={t('fieldGender')} value={f.gender} onChange={set('gender')} options={GENDER_VALUES} labelFor={(v) => t(GENDER_KEY[v])} />
      <TextField label={t('fieldJobTitleEn')} value={f.jobTitleEn} onChange={set('jobTitleEn')} />
      <TextField label={t('fieldJobTitleAr')} value={f.jobTitleAr} onChange={set('jobTitleAr')} dir="rtl" />
      <TextField label={t('fieldDepartment')} value={f.department} onChange={set('department')} />
      <SelectField label={t('fieldContractType')} value={f.contractType} onChange={set('contractType')} options={CONTRACT_TYPE_VALUES} labelFor={(v) => t(CONTRACT_TYPE_KEY[v])} />
      <DateField label={t('fieldHireDate')} value={f.hireDate} onChange={set('hireDate')} />
      <DateField label={t('fieldContractEndDate')} value={f.contractEndDate} onChange={set('contractEndDate')} />
      <SelectField label={t('fieldEmploymentStatus')} value={f.employmentStatus} onChange={set('employmentStatus')} options={EMPLOYMENT_STATUS_VALUES} labelFor={(v) => t(EMPLOYMENT_STATUS_KEY[v])} />
    </EditDialog>
  );
}

function SalaryDialog({ emp, onClose, onSaved }: DialogProps) {
  const t = useTranslations('employees');
  const { saving, err, submit } = useSaver((u) => onSaved(u));
  const s = emp.salary!;
  const [f, setF] = useState({
    currency: s.currency,
    basicSalary: s.basicSalary?.toString() ?? '',
    housingAllowance: s.housingAllowance?.toString() ?? '',
    transportAllowance: s.transportAllowance?.toString() ?? '',
    otherAllowances: s.otherAllowances?.toString() ?? '',
    gosiWage: s.gosiWage?.toString() ?? '',
    gosiContributionBasis: s.gosiContributionBasis ?? '',
    bankIban: s.bankIban ?? '',
    wpsStatus: s.wpsStatus ?? '',
  });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = { currency: f.currency, bankIban: f.bankIban };
    numOrSkip(f.basicSalary, body, 'basicSalary');
    numOrSkip(f.housingAllowance, body, 'housingAllowance');
    numOrSkip(f.transportAllowance, body, 'transportAllowance');
    numOrSkip(f.otherAllowances, body, 'otherAllowances');
    numOrSkip(f.gosiWage, body, 'gosiWage');
    if (f.gosiContributionBasis) body.gosiContributionBasis = f.gosiContributionBasis;
    if (f.wpsStatus) body.wpsStatus = f.wpsStatus;
    void submit(`/employees/${emp.id}/salary`, body);
  }

  return (
    <EditDialog title={t('editSalaryTitle')} onClose={onClose} onSubmit={onSubmit} saving={saving} err={err}>
      <TextField label={t('fieldCurrency')} value={f.currency} onChange={set('currency')} />
      <NumField label={t('fieldBasicSalary')} value={f.basicSalary} onChange={set('basicSalary')} />
      <NumField label={t('fieldHousing')} value={f.housingAllowance} onChange={set('housingAllowance')} />
      <NumField label={t('fieldTransport')} value={f.transportAllowance} onChange={set('transportAllowance')} />
      <NumField label={t('fieldOther')} value={f.otherAllowances} onChange={set('otherAllowances')} />
      <NumField label={t('fieldGosiWage')} value={f.gosiWage} onChange={set('gosiWage')} />
      <SelectField label={t('fieldGosiBasis')} value={f.gosiContributionBasis} onChange={set('gosiContributionBasis')} options={GOSI_BASIS_VALUES} labelFor={(v) => t(GOSI_BASIS_KEY[v])} />
      <TextField label={t('fieldIban')} value={f.bankIban} onChange={set('bankIban')} />
      <SelectField label={t('fieldWps')} value={f.wpsStatus} onChange={set('wpsStatus')} options={WPS_VALUES} labelFor={(v) => t(WPS_KEY[v])} />
    </EditDialog>
  );
}

function GovdataDialog({ emp, onClose, onSaved }: DialogProps) {
  const t = useTranslations('employees');
  const { saving, err, submit } = useSaver((u) => onSaved(u));
  const g = emp.govdata!;
  const [f, setF] = useState({
    iqamaNumber: g.iqamaNumber ?? '',
    iqamaExpiry: toDateInput(g.iqamaExpiry),
    nationalId: g.nationalId ?? '',
    borderNumber: g.borderNumber ?? '',
    passportNumber: g.passportNumber ?? '',
    passportExpiry: toDateInput(g.passportExpiry),
    workPermitNumber: g.workPermitNumber ?? '',
    workPermitExpiry: toDateInput(g.workPermitExpiry),
    gosiRegistrationNumber: g.gosiRegistrationNumber ?? '',
    gosiRegistrationStatus: g.gosiRegistrationStatus ?? '',
    absherServiceRef: g.absherServiceRef ?? '',
    exitReentryStatus: g.exitReentryStatus ?? '',
    exitReentryExpiry: toDateInput(g.exitReentryExpiry),
  });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {
      iqamaNumber: f.iqamaNumber,
      nationalId: f.nationalId,
      borderNumber: f.borderNumber,
      passportNumber: f.passportNumber,
      workPermitNumber: f.workPermitNumber,
      gosiRegistrationNumber: f.gosiRegistrationNumber,
      absherServiceRef: f.absherServiceRef,
    };
    dateOrSkip(f.iqamaExpiry, body, 'iqamaExpiry');
    dateOrSkip(f.passportExpiry, body, 'passportExpiry');
    dateOrSkip(f.workPermitExpiry, body, 'workPermitExpiry');
    dateOrSkip(f.exitReentryExpiry, body, 'exitReentryExpiry');
    if (f.gosiRegistrationStatus) body.gosiRegistrationStatus = f.gosiRegistrationStatus;
    if (f.exitReentryStatus) body.exitReentryStatus = f.exitReentryStatus;
    void submit(`/employees/${emp.id}/govdata`, body);
  }

  return (
    <EditDialog title={t('editGovdataTitle')} onClose={onClose} onSubmit={onSubmit} saving={saving} err={err}>
      <TextField label={t('fieldIqama')} value={f.iqamaNumber} onChange={set('iqamaNumber')} />
      <DateField label={t('fieldIqamaExpiry')} value={f.iqamaExpiry} onChange={set('iqamaExpiry')} />
      <TextField label={t('fieldNationalId')} value={f.nationalId} onChange={set('nationalId')} />
      <TextField label={t('fieldBorder')} value={f.borderNumber} onChange={set('borderNumber')} />
      <TextField label={t('fieldPassport')} value={f.passportNumber} onChange={set('passportNumber')} />
      <DateField label={t('fieldPassportExpiry')} value={f.passportExpiry} onChange={set('passportExpiry')} />
      <TextField label={t('fieldWorkPermit')} value={f.workPermitNumber} onChange={set('workPermitNumber')} />
      <DateField label={t('fieldWorkPermitExpiry')} value={f.workPermitExpiry} onChange={set('workPermitExpiry')} />
      <TextField label={t('fieldGosiRegNo')} value={f.gosiRegistrationNumber} onChange={set('gosiRegistrationNumber')} />
      <SelectField label={t('fieldGosiRegStatus')} value={f.gosiRegistrationStatus} onChange={set('gosiRegistrationStatus')} options={GOSI_REG_VALUES} labelFor={(v) => t(GOSI_REG_KEY[v])} />
      <TextField label={t('fieldAbsher')} value={f.absherServiceRef} onChange={set('absherServiceRef')} />
      <SelectField label={t('fieldExitReentry')} value={f.exitReentryStatus} onChange={set('exitReentryStatus')} options={EXIT_REENTRY_VALUES} labelFor={(v) => t(EXIT_REENTRY_KEY[v])} />
      <DateField label={t('fieldExitReentryExpiry')} value={f.exitReentryExpiry} onChange={set('exitReentryExpiry')} />
    </EditDialog>
  );
}

function EditDialog({
  title,
  onClose,
  onSubmit,
  saving,
  err,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
  saving: boolean;
  err: string;
  children: ReactNode;
}) {
  const t = useTranslations('employees');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t('saving') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
