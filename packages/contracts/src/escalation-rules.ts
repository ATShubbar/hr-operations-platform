// The escalation ladder's RULES (ADR-021) — zod-free, so the web can import
// this file without shipping zod (the `@hr/contracts/escalation-rules` subpath).
//
// The notification centre is not a feed of things that happened. It is a
// ladder worked out from the register at the moment of asking: each obligation
// (a document's expiry, a queue deadline, a request's service level) is
// measured against day thresholds, and only the HIGHEST stage it has reached
// is shown. Nothing here is stored; change a threshold and the ladder changes.

export const ESCALATION_RULES = ['expiry', 'queue', 'sla'] as const;
export type EscalationRule = (typeof ESCALATION_RULES)[number];

/** In RISING order: each stage is more urgent, and tells more people, than the one before. */
export const ESCALATION_STAGES = ['notice', 'reminder', 'escalation', 'breach'] as const;
export type EscalationStage = (typeof ESCALATION_STAGES)[number];

/** The stages whose start an Administrator sets. Breach is fixed: the date has passed. */
export type ThresholdStage = Exclude<EscalationStage, 'breach'>;

/** The day values a threshold may take (the prototype's list). */
export const THRESHOLD_DAYS = [1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60] as const;

/** Days before the date at which each stage starts. A request has no Notice stage. */
export interface EscalationThresholds {
  expiry: { notice: number; reminder: number; escalation: number };
  queue: { notice: number; reminder: number; escalation: number };
  sla: { reminder: number; escalation: number };
}

/** The prototype's figures. */
export const DEFAULT_ESCALATION_THRESHOLDS: EscalationThresholds = {
  expiry: { notice: 30, reminder: 14, escalation: 7 },
  queue: { notice: 5, reminder: 2, escalation: 1 },
  sla: { reminder: 2, escalation: 1 },
};

/** The stages each rule has, in rising order. */
export const RULE_STAGES: Record<EscalationRule, readonly EscalationStage[]> = {
  expiry: ['notice', 'reminder', 'escalation', 'breach'],
  queue: ['notice', 'reminder', 'escalation', 'breach'],
  sla: ['reminder', 'escalation', 'breach'],
};

// Who is told at each stage. `owner` is the person (or, failing one, the role)
// the item belongs to; each stage widens the circle. FIXED by ADR-021 — it is
// not a setting. Being in an audience never widens what a person may read.
export type EscalationAudience = 'owner' | 'hr' | 'admin' | 'client';
export const STAGE_AUDIENCE: Record<
  EscalationRule,
  Partial<Record<EscalationStage, readonly EscalationAudience[]>>
> = {
  expiry: {
    notice: ['owner'],
    reminder: ['owner', 'hr'],
    escalation: ['owner', 'hr', 'admin'],
    breach: ['owner', 'hr', 'admin', 'client'],
  },
  queue: {
    notice: ['owner'],
    reminder: ['owner', 'hr'],
    escalation: ['owner', 'hr', 'admin'],
    breach: ['owner', 'hr', 'admin'],
  },
  sla: {
    reminder: ['owner', 'hr'],
    escalation: ['owner', 'hr', 'admin'],
    breach: ['owner', 'hr', 'admin', 'client'],
  },
};

/** The stages that ask for action now — the panel's "Needs action" tab. */
export const ACTION_STAGES: readonly EscalationStage[] = ['escalation', 'breach'];

// The dated documents the expiry rule watches. On the employee they are read
// from the RECORD (the dates the runway and the People screen use); insurance
// and driving licence are not stored yet and are not here.
export const EMPLOYEE_DOCS = ['iqama', 'work_permit', 'passport', 'contract'] as const;
export type EmployeeDoc = (typeof EMPLOYEE_DOCS)[number];
export const DEPENDANT_DOCS = ['iqama', 'passport', 'insurance'] as const;
export type DependantDoc = (typeof DEPENDANT_DOCS)[number];

// Who owns an expiry when the client has no named officer: government files
// sit with the GRO officers, employment paperwork with the HR officers (the
// prototype's division of labour).
export type OwnerRole = 'gro_officer' | 'hr_officer';
export const EMPLOYEE_DOC_OWNER: Record<EmployeeDoc, OwnerRole> = {
  iqama: 'gro_officer',
  work_permit: 'gro_officer',
  passport: 'gro_officer',
  contract: 'hr_officer',
};
export const DEPENDANT_DOC_OWNER: Record<DependantDoc, OwnerRole> = {
  iqama: 'gro_officer',
  passport: 'gro_officer',
  insurance: 'hr_officer',
};

// The procedures that RENEW a document. While one is open for the person, the
// expiry stays quiet: it is already being worked. Passport and contract have
// no such procedure and are never quiet.
export const RENEWED_BY: Partial<Record<EmployeeDoc, readonly string[]>> = {
  iqama: ['iqama_issue', 'iqama_renewal'],
  work_permit: ['work_permit_renewal'],
};

/** Whole days from `today` to `dueOn` (both YYYY-MM-DD). Negative = the date has passed. */
export function daysLeft(today: string, dueOn: string): number {
  const at = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return Math.round((at(dueOn) - at(today)) / 86_400_000);
}

/**
 * The HIGHEST stage a countdown has reached, or null if it is still outside
 * the rule's first window. A stage is reached when the days left are at or
 * below its threshold; Breach is reached only once the date has passed — the
 * day itself is not a breach.
 */
export function stageFor(
  rule: EscalationRule,
  days: number,
  thresholds: EscalationThresholds,
): EscalationStage | null {
  if (days < 0) return 'breach';
  const t = thresholds[rule] as Partial<Record<ThresholdStage, number>>;
  if (t.escalation !== undefined && days <= t.escalation) return 'escalation';
  if (t.reminder !== undefined && days <= t.reminder) return 'reminder';
  if (t.notice !== undefined && days <= t.notice) return 'notice';
  return null;
}

/**
 * Within a rule a later stage may not start EARLIER than the one before it
 * (a Reminder at 30 days with a Notice at 14 would mean the notice never
 * shows). Returns the first rule and stage that break the order, or null.
 */
export function thresholdOrderProblem(
  thresholds: EscalationThresholds,
): { rule: EscalationRule; stage: ThresholdStage } | null {
  for (const rule of ESCALATION_RULES) {
    const t = thresholds[rule] as Partial<Record<ThresholdStage, number>>;
    const order: ThresholdStage[] = ['notice', 'reminder', 'escalation'];
    let previous: number | undefined;
    for (const stage of order) {
      const value = t[stage];
      if (value === undefined) continue;
      if (previous !== undefined && value > previous) return { rule, stage };
      previous = value;
    }
  }
  return null;
}

export const ESCALATION_THRESHOLDS_KEY = 'escalation.thresholds';
