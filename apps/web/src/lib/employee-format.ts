import { formatGregorian, formatHijri } from '@hr/dates';

// Shared display helpers for the employees UI (EMP-03). Dates follow the ADR-005
// dual-calendar rule: storage is Gregorian UTC, we RENDER Hijri (Umm al-Qura)
// primary with the Gregorian equivalent alongside. Enum label maps point at keys
// in the `employees` message namespace (nested), resolved by the caller's t().

export type Locale = 'ar' | 'en';

// Hijri · Gregorian, from a nullable ISO string. Returns null so callers render
// their own "—" placeholder.
export function dualDate(iso: string | null, locale: Locale): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${formatHijri(d, locale)} · ${formatGregorian(d, locale)}`;
}

// ISO string → yyyy-mm-dd for <input type="date"> (Gregorian input; storage and
// display stay dual-calendar per ADR-005).
export function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

// Option value lists for the form selects (kept here so the pages don't
// re-declare them). `as const` gives each a literal-union element type, which
// the KEY maps below are keyed on — so map[value] is `string`, never
// `string | undefined` under noUncheckedIndexedAccess.
export const EMPLOYMENT_STATUS_VALUES = ['active', 'on_leave', 'suspended', 'terminated'] as const;
export const CONTRACT_TYPE_VALUES = [
  'unlimited',
  'fixed_term',
  'part_time',
  'temporary',
  'seasonal',
] as const;
export const GENDER_VALUES = ['male', 'female'] as const;
export const GOSI_BASIS_VALUES = ['basic', 'basic_plus_housing'] as const;
export const WPS_VALUES = ['compliant', 'pending', 'non_compliant'] as const;
export const EXIT_REENTRY_VALUES = ['none', 'single', 'multiple'] as const;
export const GOSI_REG_VALUES = ['registered', 'pending', 'not_registered'] as const;

export type EmploymentStatusV = (typeof EMPLOYMENT_STATUS_VALUES)[number];
export type ContractTypeV = (typeof CONTRACT_TYPE_VALUES)[number];
export type GenderV = (typeof GENDER_VALUES)[number];
export type GosiBasisV = (typeof GOSI_BASIS_VALUES)[number];
export type WpsV = (typeof WPS_VALUES)[number];
export type ExitReentryV = (typeof EXIT_REENTRY_VALUES)[number];
export type GosiRegV = (typeof GOSI_REG_VALUES)[number];

// Enum → message key (in the `employees` namespace). Used as t(EMPLOYMENT_STATUS_KEY[value]).
export const EMPLOYMENT_STATUS_KEY: Record<EmploymentStatusV, string> = {
  active: 'status.active',
  on_leave: 'status.on_leave',
  suspended: 'status.suspended',
  terminated: 'status.terminated',
};

export const CONTRACT_TYPE_KEY: Record<ContractTypeV, string> = {
  unlimited: 'contract.unlimited',
  fixed_term: 'contract.fixed_term',
  part_time: 'contract.part_time',
  temporary: 'contract.temporary',
  seasonal: 'contract.seasonal',
};

export const GENDER_KEY: Record<GenderV, string> = {
  male: 'gender.male',
  female: 'gender.female',
};

export const GOSI_BASIS_KEY: Record<GosiBasisV, string> = {
  basic: 'gosiBasis.basic',
  basic_plus_housing: 'gosiBasis.basic_plus_housing',
};

export const WPS_KEY: Record<WpsV, string> = {
  compliant: 'wps.compliant',
  pending: 'wps.pending',
  non_compliant: 'wps.non_compliant',
};

export const EXIT_REENTRY_KEY: Record<ExitReentryV, string> = {
  none: 'exitReentry.none',
  single: 'exitReentry.single',
  multiple: 'exitReentry.multiple',
};

export const GOSI_REG_KEY: Record<GosiRegV, string> = {
  registered: 'gosiReg.registered',
  pending: 'gosiReg.pending',
  not_registered: 'gosiReg.not_registered',
};
