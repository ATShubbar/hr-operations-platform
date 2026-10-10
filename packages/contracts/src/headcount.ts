// Who counts in a headcount? (REP-06) — the ONE rule for the Workforce report
// (API) and the dashboards (web: Overview, Reports dashboard, client figures):
// a person UNDER MANAGEMENT — has not left (`terminated`), at a company that is
// ACTIVE (an archived client is no longer serviced). Owner decision DS-17, made
// the report's too in REP-06. Leavers and archived companies stay on file; they
// just don't count.
//
// No zod here on purpose — the web imports this through the `@hr/contracts/
// headcount` subpath (the DS-06 landmine), like `work-status` (CAL-04).

//
// MOB-04a (ADR-018): someone `onboarding` is mid-mobilisation — hired, not yet
// in the Kingdom — so they are not counted either. `hasJoined` is that half of
// the rule on its own: in post (active, on leave, suspended), neither left nor
// still on the way in. Leave, and every "how many people" figure, ask it.

export function hasJoined(employmentStatus: string): boolean {
  return employmentStatus !== 'terminated' && employmentStatus !== 'onboarding';
}

export function isUnderManagement(employmentStatus: string, clientStatus: string): boolean {
  return hasJoined(employmentStatus) && clientStatus === 'active';
}
