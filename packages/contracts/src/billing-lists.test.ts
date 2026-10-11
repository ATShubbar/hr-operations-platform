import { describe, expect, it } from 'vitest';
import {
  CYCLE_MONTHS,
  DEFAULT_STANDARD_FEES,
  estimateSubscription,
  standardProcedureFee,
} from './billing-lists.js';

// BILL-04 (ADR-020): the subscription estimate is plain arithmetic in whole
// halalas — a platform fee plus a rate per person, per month, for the cycle.
describe('estimateSubscription', () => {
  const terms = { platformFeeHalalas: 350_000, seatRateHalalas: 6_500 };

  it('adds the platform fee to the rate for every person, per month', () => {
    const e = estimateSubscription({ ...terms, cycle: 'monthly' }, 11);
    expect(e).toEqual({
      headcount: 11,
      platformFeeHalalas: 350_000,
      seatsHalalas: 71_500,
      monthlyHalalas: 421_500,
      cycleMonths: 1,
      cycleHalalas: 421_500,
      annualHalalas: 5_058_000,
    });
  });

  it('bills the cycle: one, three or twelve months — the annual value never changes', () => {
    for (const cycle of ['monthly', 'quarterly', 'annual'] as const) {
      const e = estimateSubscription({ ...terms, cycle }, 11);
      expect(e.cycleMonths).toBe(CYCLE_MONTHS[cycle]);
      expect(e.cycleHalalas).toBe(421_500 * CYCLE_MONTHS[cycle]);
      expect(e.annualHalalas).toBe(5_058_000);
    }
  });

  it('nobody under management leaves the platform fee alone', () => {
    const e = estimateSubscription({ ...terms, cycle: 'quarterly' }, 0);
    expect(e.seatsHalalas).toBe(0);
    expect(e.monthlyHalalas).toBe(350_000);
    expect(e.cycleHalalas).toBe(1_050_000);
  });

  it('stays in whole halalas at the largest terms the API accepts', () => {
    const e = estimateSubscription(
      { platformFeeHalalas: 100_000_000, seatRateHalalas: 100_000_000, cycle: 'annual' },
      10_000,
    );
    expect(Number.isSafeInteger(e.annualHalalas)).toBe(true);
  });
});

// DEP-06 (owner decision): a dependant's iqama renewal has no figure of its
// own — it prefills the annual dependant fee, the one number Settings holds
// and the Family tab shows.
describe('standardProcedureFee', () => {
  it('a dependant iqama renewal IS the annual dependant fee, and follows it', () => {
    expect(standardProcedureFee(DEFAULT_STANDARD_FEES, 'dependant_iqama_renewal')).toBe(
      DEFAULT_STANDARD_FEES.dependantAnnual,
    );
    const changed = { ...DEFAULT_STANDARD_FEES, dependantAnnual: 510_000 };
    expect(standardProcedureFee(changed, 'dependant_iqama_renewal')).toBe(510_000);
    // And it is not a second box to keep in step.
    expect('dependant_iqama_renewal' in DEFAULT_STANDARD_FEES.procedures).toBe(false);
  });

  it('every other procedure reads its own figure; an unknown type is zero', () => {
    expect(standardProcedureFee(DEFAULT_STANDARD_FEES, 'iqama_renewal')).toBe(970_000);
    expect(standardProcedureFee(DEFAULT_STANDARD_FEES, 'no_such_type')).toBe(0);
  });
});
