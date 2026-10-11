import { describe, expect, it } from 'vitest';
import { candidateStageSchema } from './candidate.js';
import { AT_RISK_DAYS, candidateHealth } from './candidate-health.js';

// SOON-04: a candidate's health is WORKED OUT from their target date — never
// typed (owner decision). One function, used by the Hiring board and the
// candidate window, so the two cannot disagree.
describe('candidate health (SOON-04)', () => {
  const today = '2026-10-11';
  const on = (targetDate: string | null, stage = 'interview') =>
    candidateHealth({ targetDate, stage, today });

  it('is on track while more than four days remain', () => {
    expect(on('2026-10-16')).toEqual({ health: 'on_track', daysToTarget: 5 });
    expect(on('2026-12-01')).toEqual({ health: 'on_track', daysToTarget: 51 });
  });

  it('is at risk from four days out, through the target day itself', () => {
    expect(AT_RISK_DAYS).toBe(4);
    expect(on('2026-10-15')).toEqual({ health: 'at_risk', daysToTarget: 4 });
    expect(on('2026-10-12')).toEqual({ health: 'at_risk', daysToTarget: 1 });
    expect(on('2026-10-11')).toEqual({ health: 'at_risk', daysToTarget: 0 });
  });

  it('is past target from the day after', () => {
    expect(on('2026-10-10')).toEqual({ health: 'past_target', daysToTarget: -1 });
    expect(on('2026-09-01')).toEqual({ health: 'past_target', daysToTarget: -40 });
  });

  it('has no health without a target date', () => {
    expect(on(null)).toBeNull();
  });

  it('has no health once the candidate is finished — and every stage is decided', () => {
    const finished = ['hired', 'rejected', 'withdrawn'];
    for (const stage of candidateStageSchema.options) {
      const result = on('2026-09-01', stage);
      // A stage added later must be placed in one group or the other on purpose.
      if (finished.includes(stage)) expect(result, stage).toBeNull();
      else expect(result, stage).toEqual({ health: 'past_target', daysToTarget: -40 });
    }
  });

  it('counts whole calendar days, across a month and a year end', () => {
    expect(
      candidateHealth({ targetDate: '2027-01-02', stage: 'offer', today: '2026-12-30' }),
    ).toEqual({
      health: 'at_risk',
      daysToTarget: 3,
    });
  });
});
