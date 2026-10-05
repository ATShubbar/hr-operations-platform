import { describe, expect, it } from 'vitest';
import { clientStatusSchema } from './client-company.js';
import { employmentStatusSchema } from './employee.js';
import { isUnderManagement } from './headcount.js';

// REP-06: ONE headcount rule — "under management" — for the Workforce report and
// the dashboards: a person who has not left, at a company that is active. Every
// employment and client status is decided here.
describe('headcount (REP-06)', () => {
  it('counts everyone who has not left, at an active company — and nobody else', () => {
    for (const employment of employmentStatusSchema.options) {
      for (const client of clientStatusSchema.options) {
        const expected = employment !== 'terminated' && client === 'active';
        expect(isUnderManagement(employment, client), `${employment} @ ${client}`).toBe(expected);
      }
    }
  });

  it('the statuses are the known ones — a new one fails here until someone decides it', () => {
    expect([...employmentStatusSchema.options].sort()).toEqual(['active', 'on_leave', 'suspended', 'terminated']);
    expect([...clientStatusSchema.options].sort()).toEqual(['active', 'inactive']);
  });
});
