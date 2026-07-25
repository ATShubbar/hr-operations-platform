import type { Permission } from '../../auth/public-api';

// The report catalog (REP-01; ACTION-PLAN 5.4, architecture module 11).
//
// A report is DATA, not code branching: each definition declares the permissions
// the caller must hold to run it. That is what makes the architecture's Reports
// matrix row — "Recruiter R (recruitment) · HR Officer R (HR ops) · GRO Officer R
// (GRO) · Finance R (financial)" — fall out of the existing catalog instead of
// needing a second, parallel authorization model: a report is readable exactly
// when its UNDERLYING data is readable. A recruiter holds vacancy/candidate.read
// but not gro.read, so `gro-workload` is not in their catalog at all; only
// salary.read holders (Finance/HR Officer/Admins) can reach `payroll-cost`.
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
  // govdata.read — which Recruiter and Finance do NOT hold (matrix), so the
  // compliance view is restricted to Admins/HR/GRO/Read-Only exactly as intended.
  'compliance-expiry': {
    id: 'compliance-expiry',
    category: 'compliance',
    requiredPermissions: ['employee.read', 'govdata.read', 'document.read'],
  },
  // The recruitment funnel — vacancies with their candidate stage counts.
  // GRO Officer and Finance are excluded from recruitment (REC-02 grants).
  'recruitment-pipeline': {
    id: 'recruitment-pipeline',
    category: 'recruitment',
    requiredPermissions: ['vacancy.read', 'candidate.read'],
  },
  // Government-process workload by type, with overdue counts. gro.read excludes
  // Recruiter and Finance (GRO-02 grants).
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
  // grant in the catalog (matrix: HR Officer RU, Finance RU, Admins R).
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
