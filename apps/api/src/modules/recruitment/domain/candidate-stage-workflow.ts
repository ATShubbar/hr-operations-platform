import type { CandidateStage } from '../../../generated/prisma/client';

// The candidate pipeline workflow (REC-04). Staff advance a candidate along these
// edges only (gated by candidate.advance); anything else is illegal (400). The
// happy path moves forward one step at a time; `rejected`/`withdrawn` are reachable
// from any ACTIVE stage. `hired`/`rejected`/`withdrawn` are terminal. Reaching
// `hired` is what REC-05's CandidateHired → Employees event will hang off.
const TRANSITIONS: Record<CandidateStage, readonly CandidateStage[]> = {
  applied: ['screening', 'rejected', 'withdrawn'],
  screening: ['interview', 'rejected', 'withdrawn'],
  interview: ['offer', 'rejected', 'withdrawn'],
  offer: ['hired', 'rejected', 'withdrawn'],
  hired: [],
  rejected: [],
  withdrawn: [],
};

export function canTransition(from: CandidateStage, to: CandidateStage): boolean {
  return TRANSITIONS[from].includes(to);
}
