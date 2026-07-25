import type { StatusTone } from '@/components/ui/status-pill';

// The single source of truth for "what colour is this state" (UX-02).
//
// The audit found the same semantic wearing different colours on different
// screens — `resolved` was solid, `completed` was an outline, `terminated` shared
// its grey with `on_leave`, and every audit action rendered in brand gold. The fix
// is not discipline, it is one table.
//
// The rule from the research: labels are unbounded, TONES ARE FIVE. Every state a
// domain has maps onto exactly one of critical/warning/ok/info/neutral. Five is
// roughly where hue stops being distinguishable at a glance, and it is what
// Atlassian and Polaris converged on after shipping dozens of statuses each.

const VACANCY: Record<string, StatusTone> = {
  draft: 'neutral',
  open: 'info',
  filled: 'ok',
  closed: 'neutral',
  cancelled: 'critical',
};

const GRO: Record<string, StatusTone> = {
  not_started: 'neutral',
  in_progress: 'info',
  submitted: 'info',
  approved: 'ok',
  completed: 'ok',
  rejected: 'critical',
  cancelled: 'neutral',
};

const REQUEST: Record<string, StatusTone> = {
  open: 'info',
  in_progress: 'info',
  resolved: 'ok',
  closed: 'ok',
  cancelled: 'neutral',
};

const TASK: Record<string, StatusTone> = {
  open: 'info',
  in_progress: 'info',
  done: 'ok',
  cancelled: 'neutral',
};

const DOCUMENT: Record<string, StatusTone> = {
  pending: 'neutral',
  available: 'ok',
  quarantined: 'critical',
  deleted: 'neutral',
};

const EMPLOYEE: Record<string, StatusTone> = {
  active: 'ok',
  on_leave: 'info',
  // Distinct from on_leave on purpose: the audit found all three non-active
  // states collapsed into one grey, so a suspended employee looked identical to
  // one on holiday.
  suspended: 'warning',
  terminated: 'neutral',
};

// Candidate stages are SEVEN — too many for hue. The pipeline board already
// encodes progress by lane position, so colour would be spending a channel twice.
// One info tone for everything in flight; ok only at hired, critical only at
// rejected.
const CANDIDATE: Record<string, StatusTone> = {
  applied: 'info',
  screening: 'info',
  interview: 'info',
  offer: 'info',
  hired: 'ok',
  rejected: 'critical',
  withdrawn: 'neutral',
};

// Added in UX-03c, when the clients console moved off a decorative Badge onto a
// semantic StatusPill. An archived client is not a fault or a warning — it is
// simply not current, which is what neutral means here.
const CLIENT: Record<string, StatusTone> = {
  active: 'ok',
  inactive: 'neutral',
};

// Google Calendar invitations (UX-03c). A cancelled invitation is not a failure —
// the withdrawal succeeded — so it is neutral, not critical. The screen previously
// painted it `destructive`, which read as "something went wrong".
const INVITATION: Record<string, StatusTone> = {
  scheduled: 'ok',
  cancelled: 'neutral',
};

// Portal users (UX-10a). A disabled account is not a fault — someone turned it
// off deliberately — so it is neutral, the same reading as an archived client.
const USER: Record<string, StatusTone> = {
  active: 'ok',
  disabled: 'neutral',
};

const DOMAINS = {
  vacancy: VACANCY,
  client: CLIENT,
  invitation: INVITATION,
  user: USER,
  gro: GRO,
  request: REQUEST,
  task: TASK,
  document: DOCUMENT,
  employee: EMPLOYEE,
  candidate: CANDIDATE,
} as const;

export type StatusDomain = keyof typeof DOMAINS;

export function toneFor(domain: StatusDomain, status: string | null | undefined): StatusTone {
  if (!status) return 'neutral';
  return DOMAINS[domain][status] ?? 'neutral';
}

// Expiry severity (UX-01 decision): the engine keeps six threshold tiers
// (60/30/14/7/1/0) because that is what drives alerting, but the UI shows THREE.
// Six colour steps is using hue as a magnitude scale, and the alarm-fatigue
// evidence is blunt about the cost — non-actionable signals are the mechanism by
// which people stop reading the actionable ones. The exact day count stays in the
// row, so the bucket does the scanning and the number does the precision.
export type ExpirySeverity = 'critical' | 'action' | 'watch' | 'clear';

export function expirySeverity(daysRemaining: number): ExpirySeverity {
  if (daysRemaining <= 1) return 'critical'; // expired, today, or tomorrow
  if (daysRemaining <= 14) return 'action'; // renewal must be in flight
  if (daysRemaining <= 60) return 'watch'; // awareness only — grey, no email
  return 'clear';
}

export const EXPIRY_TONE: Record<ExpirySeverity, StatusTone> = {
  critical: 'critical',
  action: 'warning',
  // Deliberately colourless. A 60-day horizon is not actionable for most staff,
  // and spending a hue on it is what turns a dashboard into a wall of colour.
  watch: 'neutral',
  clear: 'ok',
};
