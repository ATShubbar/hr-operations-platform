import { createHash } from 'node:crypto';
import type { EmployeeResponse } from '@hr/contracts';
import { csvText, toCsvDocument, type CsvCell } from '../../../csv/csv';
import type { EmployeeVisibility } from './employee-view';

// "Export register" (SOON-01): the People list as a CSV file.
//
// The COLUMNS follow what the reader may already see — the same visibility the
// screens use (EMP-02): identifier numbers only with full government data, the
// expiry dates with at least the status tier, pay only with salary. So a client
// manager's file has dates, no numbers and no pay; nothing here can widen what a
// role reads. A bank account number is deliberately in NO export: it is the one
// field whose leak costs money, and nobody needs it in a spreadsheet.
//
// Rows arrive already redacted (EmployeeResponse), so a column that should not
// exist has nothing to print even if this file were wrong.

export interface RegisterCompany {
  nameEn: string;
  nameAr: string;
}

interface Column {
  key: string;
  label: string;
  value: (e: EmployeeResponse, company: RegisterCompany | undefined) => CsvCell;
}

const day = (iso: string | null | undefined): string | null => (iso ? iso.slice(0, 10) : null);

const STATUS: Record<string, string> = {
  active: 'Active',
  on_leave: 'On leave',
  suspended: 'Suspended',
  terminated: 'Terminated',
  onboarding: 'Onboarding',
};

const CORE: Column[] = [
  { key: 'nameEn', label: 'Name (English)', value: (e) => csvText(e.name.en) },
  { key: 'nameAr', label: 'Name (Arabic)', value: (e) => csvText(e.name.ar) },
  { key: 'companyEn', label: 'Company (English)', value: (_, c) => csvText(c?.nameEn) },
  { key: 'companyAr', label: 'Company (Arabic)', value: (_, c) => csvText(c?.nameAr) },
  { key: 'positionEn', label: 'Position (English)', value: (e) => csvText(e.jobTitle.en) },
  { key: 'positionAr', label: 'Position (Arabic)', value: (e) => csvText(e.jobTitle.ar) },
  { key: 'department', label: 'Department', value: (e) => csvText(e.department) },
  { key: 'nationality', label: 'Nationality (code)', value: (e) => csvText(e.nationality) },
  {
    key: 'status',
    label: 'Status',
    value: (e) => STATUS[e.employmentStatus] ?? e.employmentStatus,
  },
  { key: 'hireDate', label: 'Hire date', value: (e) => day(e.hireDate) },
  { key: 'contractEnd', label: 'Contract end', value: (e) => day(e.contractEndDate) },
];

const DATES: Column[] = [
  { key: 'iqamaExpiry', label: 'Iqama expiry', value: (e) => day(e.govdata?.iqamaExpiry) },
  {
    key: 'workPermitExpiry',
    label: 'Work permit expiry',
    value: (e) => day(e.govdata?.workPermitExpiry),
  },
  { key: 'passportExpiry', label: 'Passport expiry', value: (e) => day(e.govdata?.passportExpiry) },
  {
    key: 'medicalInsuranceExpiry',
    label: 'Medical insurance expiry',
    value: (e) => day(e.govdata?.medicalInsuranceExpiry),
  },
  {
    key: 'drivingLicenceExpiry',
    label: 'Driving licence expiry',
    value: (e) => day(e.govdata?.drivingLicenceExpiry),
  },
];

const NUMBERS: Column[] = [
  { key: 'iqamaNumber', label: 'Iqama number', value: (e) => csvText(e.govdata?.iqamaNumber) },
  { key: 'nationalId', label: 'National ID', value: (e) => csvText(e.govdata?.nationalId) },
  {
    key: 'passportNumber',
    label: 'Passport number',
    value: (e) => csvText(e.govdata?.passportNumber),
  },
  {
    key: 'workPermitNumber',
    label: 'Work permit number',
    value: (e) => csvText(e.govdata?.workPermitNumber),
  },
  {
    key: 'medicalInsuranceNumber',
    label: 'Medical insurance number',
    value: (e) => csvText(e.govdata?.medicalInsuranceNumber),
  },
  {
    key: 'drivingLicenceNumber',
    label: 'Driving licence number',
    value: (e) => csvText(e.govdata?.drivingLicenceNumber),
  },
];

const PAY: Column[] = [
  { key: 'currency', label: 'Currency', value: (e) => csvText(e.salary?.currency) },
  { key: 'basicSalary', label: 'Basic salary', value: (e) => e.salary?.basicSalary ?? null },
  {
    key: 'housingAllowance',
    label: 'Housing allowance',
    value: (e) => e.salary?.housingAllowance ?? null,
  },
  {
    key: 'transportAllowance',
    label: 'Transport allowance',
    value: (e) => e.salary?.transportAllowance ?? null,
  },
  {
    key: 'otherAllowances',
    label: 'Other allowances',
    value: (e) => e.salary?.otherAllowances ?? null,
  },
];

function columnsFor(vis: EmployeeVisibility): Column[] {
  return [
    ...CORE,
    ...(vis.govdata === 'none' ? [] : DATES),
    ...(vis.govdata === 'full' ? NUMBERS : []),
    ...(vis.salary ? PAY : []),
  ];
}

export interface RegisterFile {
  document: string;
  /** Column keys, in order — what the audit entry records. */
  columns: string[];
  rows: number;
  /** A fingerprint of the exact bytes, so a file can later be matched to its export. */
  sha256: string;
}

export function buildRegister(
  employees: readonly EmployeeResponse[],
  companies: ReadonlyMap<string, RegisterCompany>,
  vis: EmployeeVisibility,
): RegisterFile {
  const columns = columnsFor(vis);
  const document = toCsvDocument([
    columns.map((c) => c.label),
    ...employees.map((e) => columns.map((c) => c.value(e, companies.get(e.clientId)))),
  ]);
  return {
    document,
    columns: columns.map((c) => c.key),
    rows: employees.length,
    sha256: createHash('sha256').update(document, 'utf8').digest('hex'),
  };
}

/**
 * The rows to export. No `ids` = everyone the caller could read; with `ids`, those
 * of them the caller could read, in the order given (the order on screen).
 */
export function pickForExport<T extends { id: string }>(
  readable: readonly T[],
  ids: readonly string[] | undefined,
): T[] {
  if (!ids) return [...readable];
  const byId = new Map(readable.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row && !seen.has(id)) {
      seen.add(id);
      out.push(row);
    }
  }
  return out;
}

export function registerFileName(now: Date = new Date()): string {
  return `employee-register-${now.toISOString().slice(0, 10)}.csv`;
}
