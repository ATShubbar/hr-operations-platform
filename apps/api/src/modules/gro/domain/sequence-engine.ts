import { SEQUENCES, type SequenceKind, type SequenceStepDefinition } from './sequence-definitions';

// The step engine (ADR-018, MOB-01) — PURE: given a sequence's kind, its start
// date and which steps are filed, it says what each step is and what may happen
// next. No database, no clock (callers pass `today`), so every rule is unit-tested.
//
//   filed   — done (has a filed-on date)
//   ready   — everything it waits on is filed; it may be filed now
//   blocked — something it waits on is not filed yet ("Waiting on …")
//
// A filed step may be reopened only while NO filed step depends on it: a later
// filing was made on the back of it, so that one is reopened first.

export type StepState = 'filed' | 'ready' | 'blocked';

export interface StepView extends SequenceStepDefinition {
  state: StepState;
  filedOn: string | null;
  /** Titles of the unfiled steps this one waits on (empty unless blocked). */
  waitingOn: string[];
  /** Target date, YYYY-MM-DD: the start date plus the step's day. */
  target: string;
}

export type Filed = Readonly<Record<string, string | null | undefined>>;

function addDays(isoDay: string, days: number): string {
  const d = new Date(`${isoDay}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function stepsOf(kind: SequenceKind, startedOn: string, filed: Filed): StepView[] {
  const steps = SEQUENCES[kind].steps;
  const byKey = new Map(steps.map((s) => [s.key, s]));
  return steps.map((s) => {
    const filedOn = filed[s.key] ?? null;
    const waiting = s.needs.filter((k) => !filed[k]);
    return {
      ...s,
      filedOn,
      state: filedOn ? 'filed' : waiting.length ? 'blocked' : 'ready',
      waitingOn: filedOn ? [] : waiting.map((k) => byKey.get(k)!.title),
      target: addDays(startedOn, s.day),
    };
  });
}

/** The filed steps that were filed on the back of `key` — reopening `key` must wait for them. */
export function filedDependents(kind: SequenceKind, key: string, filed: Filed): string[] {
  return SEQUENCES[kind].steps
    .filter((s) => filed[s.key] && s.needs.includes(key))
    .map((s) => s.title);
}

export function isComplete(kind: SequenceKind, filed: Filed): boolean {
  return SEQUENCES[kind].steps.every((s) => !!filed[s.key]);
}

export function stepDefinition(
  kind: SequenceKind,
  key: string,
): SequenceStepDefinition | undefined {
  return SEQUENCES[kind].steps.find((s) => s.key === key);
}

/**
 * The step list's own integrity — what a hand edit could break. Every `needs`
 * names an EARLIER step of the same list (which also rules out cycles), keys are
 * unique, the first step waits on nothing, and targets never run backwards along
 * a dependency. Returns the problems; empty means sound.
 */
export function integrityProblems(kind: SequenceKind): string[] {
  const steps = SEQUENCES[kind].steps;
  const problems: string[] = [];
  const seen = new Map<string, SequenceStepDefinition>();
  for (const s of steps) {
    if (seen.has(s.key)) problems.push(`${s.key}: duplicate key`);
    for (const n of s.needs) {
      const dep = seen.get(n);
      if (!dep) problems.push(`${s.key}: waits on "${n}", which is not an earlier step`);
      else if (dep.day > s.day)
        problems.push(`${s.key}: target day ${s.day} is before "${n}" (${dep.day})`);
    }
    seen.set(s.key, s);
  }
  if (steps[0] && steps[0].needs.length)
    problems.push(`${steps[0].key}: the first step waits on something`);
  return problems;
}
