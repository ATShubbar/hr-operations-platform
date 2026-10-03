import type { Permission } from '../../auth/public-api';

// The report catalog (REP-01; ACTION-PLAN 5.4, architecture module 11).
//
// A report is DATA, not code branching: each definition declares the permissions
// the caller must hold to run it, so a report is readable exactly when its
// UNDERLYING data is readable — no second, parallel authorization model. Since
// v1.7 (ADR-013) only the Administrator and the Auditor hold `report.read`, and
// both read all underlying data, so today every report reaches both; the
// per-report gate stays because it is what keeps a future, narrower reader
// (e.g. a role without salary.read) out of `payroll-cost`.
//
// REP-02 does the gating (filtering the catalog + enforcing per-report
// permissions on the run route). This file is the single source of truth for
// WHAT each report needs; the service that computes them is permission-agnostic.

export const REPORT_IDS = [
  'workforce',
  'compliance-expiry',
  'recruitment-pipeline',
  'gro-workload',
  'service-operations',
  'payroll-cost',
] as const;

export type ReportId = (typeof REPORT_IDS)[number];

// Grouping for presentation (REP-04) and for reading the matrix row above.
export type ReportCategory =
  | 'workforce'
  | 'compliance'
  | 'recruitment'
  | 'gro'
  | 'operations'
  | 'financial';

export interface ReportDefinition {
  readonly id: ReportId;
  readonly category: ReportCategory;
  // ALL of these must be held to run the report (AND, not OR) — a report that
  // joins two sensitivity groups requires both.
  readonly requiredPermissions: readonly Permission[];
}

export const REPORT_CATALOG: Readonly<Record<ReportId, ReportDefinition>> = {
  // Headcount and composition by client. Employee core profile is broadly
  // readable (matrix: every staff role reads employees), so this report is too.
  workforce: {
    id: 'workforce',
    category: 'workforce',
    requiredPermissions: ['employee.read', 'client.read'],
  },
  // What expires when, across employee government data AND documents. Requires
  // govdata.read, so it is restricted to readers of government data.
  'compliance-expiry': {
    id: 'compliance-expiry',
    category: 'compliance',
    requiredPermissions: ['employee.read', 'govdata.read', 'document.read'],
  },
  // The recruitment funnel — vacancies with their candidate stage counts.
  // Requires both recruitment reads (candidates are staff-internal, REC-03).
  'recruitment-pipeline': {
    id: 'recruitment-pipeline',
    category: 'recruitment',
    requiredPermissions: ['vacancy.read', 'candidate.read'],
  },
  // Government-process workload by type, with overdue counts.
  'gro-workload': {
    id: 'gro-workload',
    category: 'gro',
    requiredPermissions: ['gro.read'],
  },
  // Client-facing requests + internal tasks side by side, per client: the
  // consultancy's service load. Both permissions are in STAFF_BASE.
  'service-operations': {
    id: 'service-operations',
    category: 'operations',
    requiredPermissions: ['request.read', 'task.read'],
  },
  // The financial report: payroll cost by client. salary.read is the narrowest
  // grant in the catalog (v1.7 matrix: Administrator/HR officer RU, Auditor R).
  'payroll-cost': {
    id: 'payroll-cost',
    category: 'financial',
    requiredPermissions: ['employee.read', 'salary.read'],
  },
};

export const REPORT_DEFINITIONS: readonly ReportDefinition[] = REPORT_IDS.map(
  (id) => REPORT_CATALOG[id],
);

export function isReportId(value: string): value is ReportId {
  return (REPORT_IDS as readonly string[]).includes(value);
}
