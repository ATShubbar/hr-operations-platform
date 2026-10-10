import { describe, expect, it } from 'vitest';
import { escalationThresholdsSchema } from './escalation.js';
import {
  DEFAULT_ESCALATION_THRESHOLDS as T,
  RULE_STAGES,
  STAGE_AUDIENCE,
  daysLeft,
  stageFor,
  thresholdOrderProblem,
} from './escalation-rules.js';

// ADR-021: only the HIGHEST stage a countdown has reached is shown, and the
// day itself is not a breach.
describe('stageFor', () => {
  it('walks a document expiry up the ladder as the days run out', () => {
    expect(stageFor('expiry', 31, T)).toBeNull();
    expect(stageFor('expiry', 30, T)).toBe('notice');
    expect(stageFor('expiry', 15, T)).toBe('notice');
    expect(stageFor('expiry', 14, T)).toBe('reminder');
    expect(stageFor('expiry', 8, T)).toBe('reminder');
    expect(stageFor('expiry', 7, T)).toBe('escalation');
    expect(stageFor('expiry', 0, T)).toBe('escalation'); // expires today: not yet lapsed
    expect(stageFor('expiry', -1, T)).toBe('breach');
  });

  it('a queue deadline has its own, shorter windows', () => {
    expect(stageFor('queue', 6, T)).toBeNull();
    expect(stageFor('queue', 5, T)).toBe('notice');
    expect(stageFor('queue', 2, T)).toBe('reminder');
    expect(stageFor('queue', 1, T)).toBe('escalation');
    expect(stageFor('queue', -3, T)).toBe('breach');
  });

  it('a request has no Notice stage', () => {
    expect(stageFor('sla', 5, T)).toBeNull();
    expect(stageFor('sla', 3, T)).toBeNull();
    expect(stageFor('sla', 2, T)).toBe('reminder');
    expect(stageFor('sla', 1, T)).toBe('escalation');
    expect(stageFor('sla', -1, T)).toBe('breach');
    expect(RULE_STAGES.sla).not.toContain('notice');
    expect(STAGE_AUDIENCE.sla.notice).toBeUndefined();
  });

  it('follows the thresholds it is given — change one and the stage changes', () => {
    const wide = { ...T, expiry: { notice: 60, reminder: 30, escalation: 14 } };
    expect(stageFor('expiry', 45, T)).toBeNull();
    expect(stageFor('expiry', 45, wide)).toBe('notice');
    expect(stageFor('expiry', 10, T)).toBe('reminder');
    expect(stageFor('expiry', 10, wide)).toBe('escalation');
  });

  it('when two stages start on the same day, the later one wins', () => {
    const same = { ...T, queue: { notice: 2, reminder: 2, escalation: 2 } };
    expect(stageFor('queue', 2, same)).toBe('escalation');
  });
});

describe('each stage widens who is told', () => {
  it('never drops an audience on the way up, and only Breach reaches the client', () => {
    for (const rule of ['expiry', 'queue', 'sla'] as const) {
      let previous: readonly string[] = [];
      for (const stage of RULE_STAGES[rule]) {
        const now = STAGE_AUDIENCE[rule][stage] ?? [];
        for (const a of previous) expect(now, `${rule}.${stage}`).toContain(a);
        if (stage !== 'breach') expect(now).not.toContain('client');
        previous = now;
      }
    }
    expect(STAGE_AUDIENCE.expiry.breach).toContain('client');
    expect(STAGE_AUDIENCE.sla.breach).toContain('client');
    expect(STAGE_AUDIENCE.queue.breach).not.toContain('client'); // a queue item is staff work
  });
});

describe('daysLeft', () => {
  it('counts whole days between two dates, negative once passed', () => {
    expect(daysLeft('2026-10-10', '2026-10-10')).toBe(0);
    expect(daysLeft('2026-10-10', '2026-11-09')).toBe(30);
    expect(daysLeft('2026-10-10', '2026-10-09')).toBe(-1);
    expect(daysLeft('2026-12-31', '2027-01-01')).toBe(1);
  });
});

describe('the thresholds setting', () => {
  it('accepts the defaults and equal neighbours', () => {
    expect(thresholdOrderProblem(T)).toBeNull();
    expect(escalationThresholdsSchema.safeParse(T).success).toBe(true);
    const equal = { ...T, queue: { notice: 2, reminder: 2, escalation: 1 } };
    expect(escalationThresholdsSchema.safeParse(equal).success).toBe(true);
  });

  it('refuses a later stage that starts earlier than the one before', () => {
    const bad = { ...T, expiry: { notice: 14, reminder: 30, escalation: 7 } };
    expect(thresholdOrderProblem(bad)).toEqual({ rule: 'expiry', stage: 'reminder' });
    expect(escalationThresholdsSchema.safeParse(bad).success).toBe(false);
    const badSla = { ...T, sla: { reminder: 1, escalation: 2 } };
    expect(thresholdOrderProblem(badSla)).toEqual({ rule: 'sla', stage: 'escalation' });
  });

  it('refuses a value off the list, a missing stage, an extra key and a Breach threshold', () => {
    const no = (v: unknown) => expect(escalationThresholdsSchema.safeParse(v).success).toBe(false);
    no({ ...T, expiry: { ...T.expiry, notice: 31 } });
    no({ ...T, expiry: { ...T.expiry, notice: 0 } });
    no({ ...T, queue: { notice: 5, reminder: 2 } });
    no({ ...T, sla: { ...T.sla, notice: 5 } }); // a request has no Notice
    no({ ...T, expiry: { ...T.expiry, breach: 0 } }); // Breach is fixed
    no({ expiry: T.expiry, queue: T.queue });
    no({ ...T, leave: { notice: 5 } });
  });
});
