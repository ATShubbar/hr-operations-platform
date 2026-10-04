import type { CandidateStage } from '../../../generated/prisma/client';

// The candidate pipeline workflow (REC-04). Staff advance a candidate along these
// edges only (gated by candidate.advance); anything else is illegal (400). The
// happy path moves forward one step at a time, and (DS-09) an active stage may step
// BACK one; `rejected`/`withdrawn` are reachable from any ACTIVE stage.
// `hired`/`rejected`/`withdrawn` are terminal — `hired` has already created the
// employee (REC-05's CandidateHired → Employees), so there is no way back from it.
const TRANSITIONS: Record<CandidateStage, readonly CandidateStage[]> = {
  applied: ['screening', 'rejected', 'withdrawn'],
  screening: ['interview', 'applied', 'rejected', 'withdrawn'],
  interview: ['offer', 'screening', 'rejected', 'withdrawn'],
  offer: ['hired', 'interview', 'rejected', 'withdrawn'],
  hired: [],
  rejected: [],
  withdrawn: [],
};

export function canTransition(from: CandidateStage, to: CandidateStage): boolean {
  return TRANSITIONS[from].includes(to);
}
