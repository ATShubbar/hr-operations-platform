import { describe, expect, it } from 'vitest';
import { groProcessStatusSchema } from './gro.js';
import { requestStatusSchema } from './request.js';
import { taskStatusSchema } from './task.js';
import { FINISHED, isFinished } from './work-status.js';

// CAL-04: ONE answer to "is this work finished?" for every screen (calendar,
// reports, queue, overviews, client figures). Every status of every workflow is
// decided here — a status added later fails this test until someone decides it.
describe('work status (CAL-04)', () => {
  const open = {
    task: ['open', 'in_progress'],
    request: ['open', 'in_progress', 'info_needed'],
    procedure: ['not_started', 'in_progress', 'submitted', 'approved', 'rejected'],
  };
  const all = {
    task: taskStatusSchema.options,
    request: requestStatusSchema.options,
    procedure: groProcessStatusSchema.options,
  };

  for (const kind of ['task', 'request', 'procedure'] as const) {
    it(`${kind}: every status is decided — finished or open, never both, none missing`, () => {
      expect([...open[kind], ...FINISHED[kind]].sort()).toEqual([...all[kind]].sort());
      for (const s of open[kind]) expect(isFinished(kind, s)).toBe(false);
      for (const s of FINISHED[kind]) expect(isFinished(kind, s)).toBe(true);
    });
  }

  it('the owner’s decisions: a REJECTED procedure is open work; a RESOLVED request is finished', () => {
    expect(isFinished('procedure', 'rejected')).toBe(false);
    expect(isFinished('request', 'resolved')).toBe(true);
    expect(isFinished('request', 'info_needed')).toBe(false);
  });
});
