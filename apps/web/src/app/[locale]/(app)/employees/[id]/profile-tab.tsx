'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Lock } from 'lucide-react';
import type { EmployeeResponse } from '@hr/contracts';
import { formatHijri } from '@hr/dates';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan, useSession } from '@/lib/session';
import { NATIONALITIES } from '@/lib/nationality';
import {
  CONTRACT_TYPE_KEY,
  CONTRACT_TYPE_VALUES,
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// The Person record's Profile tab (DS-06) — the prototype's three sections,
// Identity · Employment · Compensation, each with its own Edit → Save/Cancel.
//
// Every field the record showed before the redesign is still here: the
// prototype's fields come first, in its order, and the record's other stored
// fields follow in the section they belong to (owner decision: nothing the page
// did is lost). A field the prototype names but we do not store (Qiwa contract)
// shows "—" with a note rather than an invented value.
//
// A field belongs to ONE API group — core, government data or pay — because each
// is its own endpoint with its own permission (EMP-02). A section can mix groups,
// so Save sends one PATCH per group that has a change, in order, and stops at the
// first failure. Fields the caller may not see come back null from the API; they
// render masked in place (the prototype's default treatment — its switcher was a
// design-review device and is deliberately not shipped).

type Group = 'core' | 'gov' | 'pay';
type Kind = 'text' | 'number' | 'date' | 'select';
type Drafts = Record<string, string>;
type Body = Record<string, unknown>;

interface FieldDef {
  id: string;
  label: string;
  /** null = display only, never edited here. */
  group: Group | null;
  kind?: Kind;
  mono?: boolean;
  dir?: 'ltr' | 'rtl';
  options?: { value: string; label: string }[];
  display: string | null;
  sub?: string | null;
  draft?: string;
  apply?: (drafts: Drafts, body: Body) => void;
  note?: string;
}

interface SectionDef {
  id: string;
  title: string;
  note?: string;
  fields: FieldDef[];
}

const ENDPOINT: Record<Group, (id: string) => string> = {
  core: (id) => `/employees/${id}`,
  gov: (id) => `/employees/${id}/govdata`,
  pay: (id) => `/employees/${id}/salary`,
};

const text = (key: string) => (d: Drafts, b: Body) => {
  b[key] = d[key] ?? '';
};
const number = (key: string) => (d: Drafts, b: Body) => {
  const v = (d[key] ?? '').trim();
  if (v !== '') b[key] = Number(v);
};
// Same rule as before the redesign: an emptied date is not sent (the API has no
// "clear" for these), so a date can be changed but not removed from here.
const date = (key: string) => (d: Drafts, b: Body) => {
  if (d[key]) b[key] = d[key];
};
const choice = (key: string) => (d: Drafts, b: Body) => {
  if (d[key]) b[key] = d[key];
};

export function ProfileTab({
  emp,
  clientName,
  onSaved,
  after,
}: {
  emp: EmployeeResponse;
  clientName: string;
  onSaved: (e: EmployeeResponse) => void;
  after?: ReactNode;
}) {
  const t = useTranslations('person');
  const te = useTranslations('employees');
  const tr = useTranslations('roles');
  const locale = useLocale() as Locale;
  const me = useSession();
  const role = me.role ? tr(me.role) : '';

  const can = {
    core: useCan('employee.update'),
    gov: useCan('govdata.update'),
    pay: useCan('salary.update'),
  };
  const visible = { core: true, gov: emp.govdata !== null, pay: emp.salary !== null };

  const regionNames = useMemo(() => new Intl.DisplayNames([locale], { type: 'region' }), [locale]);
  const country = (code: string | null | undefined) => {
    if (!code) return null;
    try {
      return regionNames.of(code.toUpperCase()) ?? code;
    } catch {
      return code;
    }
  };
  const day = (iso: string | null | undefined) => {
    if (!iso) return null;
    const d = new Date(iso);
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
  const hijri = (iso: string | null | undefined) =>
    iso ? formatHijri(new Date(iso), locale) : null;
  const money = (n: number | null | undefined) => (n == null ? null : n.toLocaleString('en-US'));
  const opts = <T extends string>(values: readonly T[], key: Record<T, string>) =>
    // The KEY maps hold message keys as plain strings; next-intl's typed `t`
    // cannot follow a generic map, so this one call goes through an untyped view.
    values.map((v) => ({ value: v, label: (te as unknown as (k: string) => string)(key[v]) }));

  const g = emp.govdata;
  const s = emp.salary;
  const saudi = emp.nationality.toUpperCase() === 'SA';

  const sections: SectionDef[] = [
    {
      id: 'identity',
      title: t('section.identity'),
      fields: [
        {
          id: 'fullName',
          label: t('field.fullName'),
          group: 'core',
          kind: 'text',
          dir: 'ltr',
          display: emp.name.en,
          draft: emp.name.en,
          apply: (d, b) => {
            b.name = { en: d.fullName ?? '', ar: d.nameAr ?? '' };
          },
        },
        {
          id: 'nameAr',
          label: t('field.nameAr'),
          group: 'core',
          kind: 'text',
          dir: 'rtl',
          display: emp.name.ar,
          draft: emp.name.ar,
          apply: (d, b) => {
            b.name = { en: d.fullName ?? '', ar: d.nameAr ?? '' };
          },
        },
        {
          id: 'nationality',
          label: t('field.nationality'),
          group: 'core',
          kind: 'select',
          options: [...new Set([...NATIONALITIES, emp.nationality.toUpperCase()])].map((c) => ({
            value: c,
            label: country(c) ?? c,
          })),
          display: country(emp.nationality),
          draft: emp.nationality.toUpperCase(),
          apply: choice('nationality'),
        },
        // A Saudi's identifier is the National ID; everyone else's is the iqama.
        saudi
          ? {
              id: 'nationalId',
              label: t('field.nationalId'),
              group: 'gov',
              kind: 'text',
              mono: true,
              dir: 'ltr',
              display: g?.nationalId ?? null,
              draft: g?.nationalId ?? '',
              apply: text('nationalId'),
            }
          : {
              id: 'iqamaNumber',
              label: t('field.iqamaNumber'),
              group: 'gov',
              kind: 'text',
              mono: true,
              dir: 'ltr',
              display: g?.iqamaNumber ?? null,
              draft: g?.iqamaNumber ?? '',
              apply: text('iqamaNumber'),
            },
        {
          id: 'borderNumber',
          label: t('field.borderNumber'),
          group: 'gov',
          kind: 'text',
          mono: true,
          dir: 'ltr',
          display: g?.borderNumber ?? null,
          draft: g?.borderNumber ?? '',
          apply: text('borderNumber'),
        },
        {
          id: 'passportNumber',
          label: t('field.passportNumber'),
          group: 'gov',
          kind: 'text',
          mono: true,
          dir: 'ltr',
          display: g?.passportNumber ?? null,
          draft: g?.passportNumber ?? '',
          apply: text('passportNumber'),
        },
        {
          // The prototype makes this read-only ("changed by recording a renewal on
          // the Documents tab"); that renewal arrives with DS-07, so until then it
          // stays editable here — removing the only way to change it would lose a
          // capability the record has today.
          id: 'passportExpiry',
          label: t('field.passportExpiry'),
          group: 'gov',
          kind: 'date',
          display: day(g?.passportExpiry),
          sub: hijri(g?.passportExpiry),
          draft: toDateInput(g?.passportExpiry ?? null),
          apply: date('passportExpiry'),
        },
        // ---- stored on the record; not in the prototype's Identity list ----
        ...(saudi
          ? []
          : [
              {
                id: 'iqamaExpiry',
                label: t('field.iqamaExpiry'),
                group: 'gov' as const,
                kind: 'date' as const,
                display: day(g?.iqamaExpiry),
                sub: hijri(g?.iqamaExpiry),
                draft: toDateInput(g?.iqamaExpiry ?? null),
                apply: date('iqamaExpiry'),
              },
            ]),
        // The other identifier, when one is on file (a Saudi with an old iqama
        // number, or a resident with a national ID) — kept, not hidden.
        ...(saudi && g?.iqamaNumber
          ? [
              {
                id: 'iqamaNumber',
                label: t('field.iqamaNumber'),
                group: 'gov' as const,
                kind: 'text' as const,
                mono: true,
                dir: 'ltr' as const,
                display: g.iqamaNumber,
                draft: g.iqamaNumber,
                apply: text('iqamaNumber'),
              },
            ]
          : []),
        ...(!saudi && g?.nationalId
          ? [
              {
                id: 'nationalId',
                label: t('field.nationalId'),
                group: 'gov' as const,
                kind: 'text' as const,
                mono: true,
                dir: 'ltr' as const,
                display: g.nationalId,
                draft: g.nationalId,
                apply: text('nationalId'),
              },
            ]
          : []),
        {
          id: 'gender',
          label: t('field.gender'),
          group: 'core',
          kind: 'select',
          options: opts(GENDER_VALUES, GENDER_KEY),
          display: emp.gender ? te(GENDER_KEY[emp.gender]) : null,
          draft: emp.gender ?? '',
          apply: choice('gender'),
        },
        {
          id: 'dateOfBirth',
          label: t('field.dateOfBirth'),
          group: 'core',
          kind: 'date',
          display: day(emp.dateOfBirth),
          sub: hijri(emp.dateOfBirth),
          draft: toDateInput(emp.dateOfBirth),
          apply: date('dateOfBirth'),
        },
      ],
    },
    {
      id: 'employment',
      title: t('section.employment'),
      fields: [
        {
          id: 'jobTitleEn',
          label: t('field.position'),
          group: 'core',
          kind: 'text',
          dir: 'ltr',
          display: emp.jobTitle.en,
          draft: emp.jobTitle.en ?? '',
          apply: text('jobTitleEn'),
        },
        {
          id: 'jobTitleAr',
          label: t('field.positionAr'),
          group: 'core',
          kind: 'text',
          dir: 'rtl',
          display: emp.jobTitle.ar,
          draft: emp.jobTitle.ar ?? '',
          apply: text('jobTitleAr'),
        },
        {
          id: 'department',
          label: t('field.department'),
          group: 'core',
          kind: 'text',
          display: emp.department,
          draft: emp.department ?? '',
          apply: text('department'),
        },
        {
          id: 'client',
          label: t('field.clientCompany'),
          group: null,
          display: clientName,
          note: t('note.clientCompany'),
        },
        {
          id: 'hireDate',
          label: t('field.joined'),
          group: 'core',
          kind: 'date',
          display: day(emp.hireDate),
          sub: hijri(emp.hireDate),
          draft: toDateInput(emp.hireDate),
          apply: date('hireDate'),
        },
        {
          id: 'contractEndDate',
          label: t('field.contractEnds'),
          group: 'core',
          kind: 'date',
          display: day(emp.contractEndDate),
          sub: hijri(emp.contractEndDate),
          draft: toDateInput(emp.contractEndDate),
          apply: date('contractEndDate'),
        },
        {
          id: 'qiwa',
          label: t('field.qiwaContract'),
          group: null,
          display: null,
          note: t('note.qiwaContract'),
        },
        {
          id: 'gosiRegistrationNumber',
          label: t('field.gosiNumber'),
          group: 'gov',
          kind: 'text',
          mono: true,
          dir: 'ltr',
          display: g?.gosiRegistrationNumber ?? null,
          draft: g?.gosiRegistrationNumber ?? '',
          apply: text('gosiRegistrationNumber'),
        },
        // ---- stored on the record; not in the prototype's Employment list ----
        {
          id: 'contractType',
          label: t('field.contractType'),
          group: 'core',
          kind: 'select',
          options: opts(CONTRACT_TYPE_VALUES, CONTRACT_TYPE_KEY),
          display: te(CONTRACT_TYPE_KEY[emp.contractType]),
          draft: emp.contractType,
          apply: choice('contractType'),
        },
        // MOB-04a (ADR-018): `onboarding` is the onboarding sequence's to clear —
        // while someone is mid-mobilisation the status is shown, not edited, and
        // it is never offered as a choice.
        emp.employmentStatus === 'onboarding'
          ? {
              id: 'employmentStatus',
              label: t('field.employmentStatus'),
              group: null,
              display: te(EMPLOYMENT_STATUS_KEY[emp.employmentStatus]),
              note: t('statusFollowsOnboarding'),
            }
          : {
              id: 'employmentStatus',
              label: t('field.employmentStatus'),
              group: 'core',
              kind: 'select',
              options: opts(EMPLOYMENT_STATUS_VALUES, EMPLOYMENT_STATUS_KEY),
              display: te(EMPLOYMENT_STATUS_KEY[emp.employmentStatus]),
              draft: emp.employmentStatus,
              apply: choice('employmentStatus'),
            },
        {
          id: 'saudization',
          label: t('field.saudization'),
          group: 'core',
          kind: 'select',
          options: [
            { value: 'yes', label: te('yes') },
            { value: 'no', label: te('no') },
          ],
          display:
            emp.countsTowardSaudization == null
              ? null
              : emp.countsTowardSaudization
                ? te('yes')
                : te('no'),
          draft:
            emp.countsTowardSaudization == null ? '' : emp.countsTowardSaudization ? 'yes' : 'no',
          apply: (d, b) => {
            if (d.saudization) b.countsTowardSaudization = d.saudization === 'yes';
          },
        },
        ...(saudi
          ? []
          : [
              {
                id: 'workPermitNumber',
                label: t('field.workPermitNumber'),
                group: 'gov' as const,
                kind: 'text' as const,
                mono: true,
                dir: 'ltr' as const,
                display: g?.workPermitNumber ?? null,
                draft: g?.workPermitNumber ?? '',
                apply: text('workPermitNumber'),
              },
              {
                id: 'workPermitExpiry',
                label: t('field.workPermitExpiry'),
                group: 'gov' as const,
                kind: 'date' as const,
                display: day(g?.workPermitExpiry),
                sub: hijri(g?.workPermitExpiry),
                draft: toDateInput(g?.workPermitExpiry ?? null),
                apply: date('workPermitExpiry'),
              },
            ]),
        {
          id: 'gosiRegistrationStatus',
          label: t('field.gosiStatus'),
          group: 'gov',
          kind: 'select',
          options: opts(GOSI_REG_VALUES, GOSI_REG_KEY),
          display: g?.gosiRegistrationStatus ? te(GOSI_REG_KEY[g.gosiRegistrationStatus]) : null,
          draft: g?.gosiRegistrationStatus ?? '',
          apply: choice('gosiRegistrationStatus'),
        },
        {
          id: 'absherServiceRef',
          label: t('field.absherRef'),
          group: 'gov',
          kind: 'text',
          mono: true,
          dir: 'ltr',
          display: g?.absherServiceRef ?? null,
          draft: g?.absherServiceRef ?? '',
          apply: text('absherServiceRef'),
        },
        ...(saudi
          ? []
          : [
              {
                id: 'exitReentryStatus',
                label: t('field.exitReentry'),
                group: 'gov' as const,
                kind: 'select' as const,
                options: opts(EXIT_REENTRY_VALUES, EXIT_REENTRY_KEY),
                display: g?.exitReentryStatus ? te(EXIT_REENTRY_KEY[g.exitReentryStatus]) : null,
                draft: g?.exitReentryStatus ?? '',
                apply: choice('exitReentryStatus'),
              },
              {
                id: 'exitReentryExpiry',
                label: t('field.exitReentryExpiry'),
                group: 'gov' as const,
                kind: 'date' as const,
                display: day(g?.exitReentryExpiry),
                sub: hijri(g?.exitReentryExpiry),
                draft: toDateInput(g?.exitReentryExpiry ?? null),
                apply: date('exitReentryExpiry'),
              },
            ]),
      ],
    },
    {
      id: 'compensation',
      title: t('section.compensation'),
      note: s ? t('compNote', { currency: s.currency }) : undefined,
      fields: [
        {
          id: 'basicSalary',
          label: t('field.basicSalary'),
          group: 'pay',
          kind: 'number',
          mono: true,
          display: money(s?.basicSalary),
          draft: s?.basicSalary?.toString() ?? '',
          apply: number('basicSalary'),
        },
        {
          id: 'housingAllowance',
          label: t('field.housing'),
          group: 'pay',
          kind: 'number',
          mono: true,
          display: money(s?.housingAllowance),
          draft: s?.housingAllowance?.toString() ?? '',
          apply: number('housingAllowance'),
        },
        {
          id: 'transportAllowance',
          label: t('field.transport'),
          group: 'pay',
          kind: 'number',
          mono: true,
          display: money(s?.transportAllowance),
          draft: s?.transportAllowance?.toString() ?? '',
          apply: number('transportAllowance'),
        },
        {
          id: 'bankIban',
          label: t('field.iban'),
          group: 'pay',
          kind: 'text',
          mono: true,
          dir: 'ltr',
          display: s?.bankIban ?? null,
          draft: s?.bankIban ?? '',
          apply: text('bankIban'),
        },
        // ---- stored on the record; not in the prototype's Compensation list ----
        {
          id: 'otherAllowances',
          label: t('field.otherAllowances'),
          group: 'pay',
          kind: 'number',
          mono: true,
          display: money(s?.otherAllowances),
          draft: s?.otherAllowances?.toString() ?? '',
          apply: number('otherAllowances'),
        },
        {
          id: 'gosiWage',
          label: t('field.gosiWage'),
          group: 'pay',
          kind: 'number',
          mono: true,
          display: money(s?.gosiWage),
          draft: s?.gosiWage?.toString() ?? '',
          apply: number('gosiWage'),
        },
        {
          id: 'gosiContributionBasis',
          label: t('field.gosiBasis'),
          group: 'pay',
          kind: 'select',
          options: opts(GOSI_BASIS_VALUES, GOSI_BASIS_KEY),
          display: s?.gosiContributionBasis ? te(GOSI_BASIS_KEY[s.gosiContributionBasis]) : null,
          draft: s?.gosiContributionBasis ?? '',
          apply: choice('gosiContributionBasis'),
        },
        {
          id: 'wpsStatus',
          label: t('field.wps'),
          group: 'pay',
          kind: 'select',
          options: opts(WPS_VALUES, WPS_KEY),
          display: s?.wpsStatus ? te(WPS_KEY[s.wpsStatus]) : null,
          draft: s?.wpsStatus ?? '',
          apply: choice('wpsStatus'),
        },
        {
          id: 'currency',
          label: t('field.currency'),
          group: 'pay',
          kind: 'text',
          mono: true,
          dir: 'ltr',
          display: s?.currency ?? null,
          draft: s?.currency ?? '',
          apply: text('currency'),
        },
      ],
    },
  ];

  const masked = (f: FieldDef) => f.group !== null && !visible[f.group];
  const editable = (f: FieldDef) =>
    f.group !== null && !!f.apply && visible[f.group] && can[f.group];

  // ---- editing: one section at a time, as in the prototype ----
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const startEdit = (sec: SectionDef) => {
    const d: Drafts = {};
    for (const f of sec.fields) if (f.draft !== undefined) d[f.id] = f.draft;
    setDrafts(d);
    setError('');
    setEditing(sec.id);
  };

  async function save(sec: SectionDef) {
    setSaving(true);
    setError('');
    let latest: EmployeeResponse | null = null;
    try {
      for (const group of ['core', 'gov', 'pay'] as const) {
        const body: Body = {};
        for (const f of sec.fields) {
          if (f.group !== group || !editable(f)) continue;
          if ((drafts[f.id] ?? '') === (f.draft ?? '')) continue; // unchanged
          f.apply!(drafts, body);
        }
        if (Object.keys(body).length === 0) continue;
        latest = await apiFetch<EmployeeResponse>(ENDPOINT[group](emp.id), {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      }
      if (latest) onSaved(latest);
      setEditing(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      // A group that saved before the failure did save; show the server's view.
      if (latest) onSaved(latest);
      setError(t('saveError'));
    } finally {
      setSaving(false);
    }
  }

  const redaction =
    !visible.pay && !visible.gov ? 'both' : !visible.pay ? 'pay' : !visible.gov ? 'ids' : 'all';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3.5 rounded-xl bg-neutral-50 px-4 py-3 ring-1 ring-foreground/10">
        <Lock className="size-4 shrink-0" aria-hidden />
        <span className="grow text-[13px] leading-[18px] text-neutral-700">
          {t(`redaction.${redaction}`, { role })}
        </span>
      </div>

      {sections.map((sec) => {
        const isEditing = editing === sec.id;
        const anyEditable = sec.fields.some(editable);
        return (
          <section
            key={sec.id}
            aria-labelledby={`sec-${sec.id}`}
            className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
          >
            <div className="flex flex-wrap items-baseline gap-2.5 border-b px-4 py-3.5">
              <h2 id={`sec-${sec.id}`} className="text-base leading-6 font-medium">
                {sec.title}
              </h2>
              <span className="grow text-xs leading-4 text-muted-foreground">{sec.note}</span>
              {anyEditable && !isEditing && (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => startEdit(sec)}
                  disabled={editing !== null}
                >
                  {t('edit')}
                </Button>
              )}
              {isEditing && (
                <span className="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setEditing(null)}
                    disabled={saving}
                  >
                    {t('cancel')}
                  </Button>
                  <Button size="xs" onClick={() => void save(sec)} disabled={saving}>
                    {saving ? t('saving') : t('save')}
                  </Button>
                </span>
              )}
              {/* "can read but not change" is only true when something here is
                  readable — for a fully masked section the masks already say it
                  (the prototype shows the line regardless). */}
              {!anyEditable && sec.fields.some((f) => !masked(f)) && (
                <span className="shrink-0 text-[11px] leading-[15px] text-neutral-400">
                  {t('readOnlySection', { role })}
                </span>
              )}
            </div>
            {isEditing && error && (
              <p role="alert" className="border-b px-4 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <dl className="grid grid-cols-1 sm:grid-cols-2">
              {sec.fields.map((f) => (
                <div
                  key={f.id}
                  className="flex min-w-0 flex-col gap-0.5 px-4 py-3 shadow-[inset_0_-1px_0_var(--border)]"
                >
                  <dt className="text-xs leading-4 text-muted-foreground">
                    {isEditing && editable(f) ? (
                      <label htmlFor={`f-${sec.id}-${f.id}`}>{f.label}</label>
                    ) : (
                      f.label
                    )}
                  </dt>
                  <dd className="min-w-0">
                    {isEditing && editable(f) ? (
                      <FieldInput
                        id={`f-${sec.id}-${f.id}`}
                        field={f}
                        value={drafts[f.id] ?? ''}
                        onChange={(v) => setDrafts((d) => ({ ...d, [f.id]: v }))}
                      />
                    ) : masked(f) ? (
                      <span className="flex flex-col gap-0.5">
                        <span className="flex h-5 items-center gap-2">
                          <span
                            aria-hidden
                            className="font-mono text-sm tracking-[0.18em] text-neutral-300"
                          >
                            ••••••••
                          </span>
                          <Lock className="size-3 text-neutral-400" aria-hidden />
                        </span>
                        <span className="text-[11px] leading-[15px] text-neutral-400">
                          {t('hiddenFrom', { role })}
                        </span>
                      </span>
                    ) : (
                      <span className="flex flex-col gap-0.5">
                        <span
                          className={
                            f.mono
                              ? 'font-mono text-sm leading-5 break-words'
                              : 'text-sm leading-5 break-words'
                          }
                        >
                          {f.display == null || f.display === '' ? (
                            '—'
                          ) : f.dir ? (
                            // Identifiers and names keep their own direction inside
                            // the other script's page (UX-08).
                            <bdi dir={f.dir}>{f.display}</bdi>
                          ) : (
                            f.display
                          )}
                        </span>
                        {f.sub && (
                          <span className="text-[11px] leading-[15px] text-neutral-400">
                            {f.sub}
                          </span>
                        )}
                      </span>
                    )}
                    {isEditing && !editable(f) && f.note && (
                      <span className="mt-0.5 block text-[11px] leading-[15px] text-pretty text-neutral-400">
                        {f.note}
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}

      {after}
    </div>
  );
}

function FieldInput({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  if (field.kind === 'select') {
    const label = (v: string) => field.options?.find((o) => o.value === v)?.label ?? '';
    return (
      <Select value={value} onValueChange={(v) => onChange(v ?? '')}>
        <SelectTrigger id={id} size="sm" className="w-full">
          <SelectValue>{(v) => (v ? label(String(v)) : '—')}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {field.options?.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return (
    <Input
      id={id}
      type={field.kind === 'date' ? 'date' : field.kind === 'number' ? 'number' : 'text'}
      step={field.kind === 'number' ? '0.01' : undefined}
      dir={field.dir}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-7 w-full text-sm ${field.mono ? 'font-mono' : ''} ${field.dir === 'ltr' ? 'text-start' : ''}`}
    />
  );
}
