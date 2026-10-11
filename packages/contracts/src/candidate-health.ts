// A candidate's health, worked out from their target date (SOON-04).
//
// Owner decision: "worked out from the target date" — never typed. The prototype
// kept a hand-set On track / At risk / Blocked beside the date; a flag someone
// must remember to change goes stale, so here the date is the only thing a person
// records and the health follows from it:
//
//   on_track     more than AT_RISK_DAYS days remain
//   at_risk      AT_RISK_DAYS days or fewer remain, the target day included
//   past_target  the target day has gone   (the prototype's "Blocked" slot)
//
// No health without a target date, or once the candidate is finished (hired,
// rejected, withdrawn) — there is nothing left to be late for.
//
// Zero dependencies on purpose: the web imports this subpath
// (`@hr/contracts/candidate-health`) without pulling zod into the page.

export type CandidateHealth = 'on_track' | 'at_risk' | 'past_target';

/** The prototype's threshold: amber from four days out. */
export const AT_RISK_DAYS = 4;

const FINISHED_STAGES: readonly string[] = ['hired', 'rejected', 'withdrawn'];
const DAY_MS = 86_400_000;
const at = (day: string): number => Date.parse(`${day.slice(0, 10)}T00:00:00.000Z`);

export function candidateHealth(input: {
  /** YYYY-MM-DD, or null when none was recorded. */
  targetDate: string | null;
  stage: string;
  /** YYYY-MM-DD — the viewer's day. */
  today: string;
}): { health: CandidateHealth; daysToTarget: number } | null {
  if (!input.targetDate || FINISHED_STAGES.includes(input.stage)) return null;
  const daysToTarget = Math.round((at(input.targetDate) - at(input.today)) / DAY_MS);
  const health: CandidateHealth =
    daysToTarget < 0 ? 'past_target' : daysToTarget <= AT_RISK_DAYS ? 'at_risk' : 'on_track';
  return { health, daysToTarget };
}
