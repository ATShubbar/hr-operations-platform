// Who counts in a headcount? (REP-06) — the ONE rule for the Workforce report
// (API) and the dashboards (web: Overview, Reports dashboard, client figures):
// a person UNDER MANAGEMENT — has not left (`terminated`), at a company that is
// ACTIVE (an archived client is no longer serviced). Owner decision DS-17, made
// the report's too in REP-06. Leavers and archived companies stay on file; they
// just don't count.
//
// No zod here on purpose — the web imports this through the `@hr/contracts/
// headcount` subpath (the DS-06 landmine), like `work-status` (CAL-04).

export function isUnderManagement(employmentStatus: string, clientStatus: string): boolean {
  return employmentStatus !== 'terminated' && clientStatus === 'active';
}
