import type { EmployeeResponse, SelfProfileResponse } from '@hr/contracts';
import type { EmployeeModel as EmployeeRecord } from '../../../generated/prisma/models';

// The employee read view + its field-level redaction (EMP-02). Extracted from
// the staff controller so the client portal (PORTAL-02) reuses the SAME field
// sensitivity rules — one source of truth for what each capability may see.
//
// - salary: a boolean gate (salary.read) — the whole financial group or null.
// - govdata: three tiers —
//     'full'   → identifiers + expiry/status (staff with govdata.read)
//     'status' → expiry/status ONLY, identifiers redacted (the client portal)
//     'none'   → the whole government group is null
export interface EmployeeVisibility {
  salary: boolean;
  govdata: 'full' | 'status' | 'none';
}

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}
function num(d: { toNumber(): number } | null): number | null {
  return d == null ? null : d.toNumber();
}

export function toEmployeeResponse(e: EmployeeRecord, vis: EmployeeVisibility): EmployeeResponse {
  const govFull = vis.govdata === 'full';
  return {
    id: e.id,
    clientId: e.clientId,
    name: { ar: e.nameAr, en: e.nameEn },
    nationality: e.nationality,
    gender: e.gender,
    dateOfBirth: iso(e.dateOfBirth),
    jobTitle: { ar: e.jobTitleAr, en: e.jobTitleEn },
    department: e.department,
    hireDate: iso(e.hireDate),
    employmentStatus: e.employmentStatus,
    contractType: e.contractType,
    contractEndDate: iso(e.contractEndDate),
    countsTowardSaudization: e.countsTowardSaudization,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    salary: vis.salary
      ? {
          currency: e.currency,
          basicSalary: num(e.basicSalary),
          housingAllowance: num(e.housingAllowance),
          transportAllowance: num(e.transportAllowance),
          otherAllowances: num(e.otherAllowances),
          gosiWage: num(e.gosiWage),
          gosiContributionBasis: e.gosiContributionBasis,
          bankIban: e.bankIban,
          wpsStatus: e.wpsStatus,
        }
      : null,
    govdata:
      vis.govdata === 'none'
        ? null
        : {
            // identifiers: staff-only (`full`)
            iqamaNumber: govFull ? e.iqamaNumber : null,
            nationalId: govFull ? e.nationalId : null,
            borderNumber: govFull ? e.borderNumber : null,
            passportNumber: govFull ? e.passportNumber : null,
            workPermitNumber: govFull ? e.workPermitNumber : null,
            gosiRegistrationNumber: govFull ? e.gosiRegistrationNumber : null,
            absherServiceRef: govFull ? e.absherServiceRef : null,
            // expiry/status: visible at both `full` and `status`
            iqamaExpiry: iso(e.iqamaExpiry),
            passportExpiry: iso(e.passportExpiry),
            workPermitExpiry: iso(e.workPermitExpiry),
            exitReentryStatus: e.exitReentryStatus,
            exitReentryExpiry: iso(e.exitReentryExpiry),
            gosiRegistrationStatus: e.gosiRegistrationStatus,
          },
  };
}

// The SELF view (SS-03, ADR-011) — what an employee sees of their OWN record.
// Kept here beside the staff and portal views so every field-sensitivity rule for
// this table lives in one file. It is a WHITELIST built field by field, not the
// staff response with fields nulled: a field added to the staff shape does not
// reach employees unless someone adds it here on purpose.
//
// Deliberately absent — the employer's / consultancy's working fields, not facts
// about the person: countsTowardSaudization, absherServiceRef, wpsStatus,
// gosiContributionBasis, createdAt/updatedAt. The IBAN is reduced to its last 4.
export function toSelfProfileResponse(
  e: EmployeeRecord,
  company: { ar: string; en: string },
): SelfProfileResponse {
  return {
    id: e.id,
    name: { ar: e.nameAr, en: e.nameEn },
    nationality: e.nationality,
    gender: e.gender,
    dateOfBirth: iso(e.dateOfBirth),
    company,
    jobTitle: { ar: e.jobTitleAr, en: e.jobTitleEn },
    department: e.department,
    hireDate: iso(e.hireDate),
    employmentStatus: e.employmentStatus,
    contractType: e.contractType,
    contractEndDate: iso(e.contractEndDate),
    identifiers: {
      iqamaNumber: e.iqamaNumber,
      iqamaExpiry: iso(e.iqamaExpiry),
      nationalId: e.nationalId,
      borderNumber: e.borderNumber,
      passportNumber: e.passportNumber,
      passportExpiry: iso(e.passportExpiry),
      workPermitNumber: e.workPermitNumber,
      workPermitExpiry: iso(e.workPermitExpiry),
      gosiRegistrationNumber: e.gosiRegistrationNumber,
      gosiRegistrationStatus: e.gosiRegistrationStatus,
      exitReentryStatus: e.exitReentryStatus,
      exitReentryExpiry: iso(e.exitReentryExpiry),
    },
    pay: {
      currency: e.currency,
      basicSalary: num(e.basicSalary),
      housingAllowance: num(e.housingAllowance),
      transportAllowance: num(e.transportAllowance),
      otherAllowances: num(e.otherAllowances),
      gosiWage: num(e.gosiWage),
      bankIbanLast4: e.bankIban ? e.bankIban.replace(/\s+/g, '').slice(-4) : null,
    },
  };
}
