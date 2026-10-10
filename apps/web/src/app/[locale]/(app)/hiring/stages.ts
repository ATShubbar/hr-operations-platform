import type { CandidateStage } from '@hr/contracts';

// The hiring board's columns (DS-09), in the prototype's order — all six are real
// candidate stages since MOB-04b (ADR-018): `mobilisation` is "Visa &
// mobilisation", where the employee record exists as `onboarding` and their
// onboarding sequence is running.
export type Column = Exclude<CandidateStage, 'rejected' | 'withdrawn'>;
export const COLUMNS: readonly Column[] = [
  'applied',
  'screening',
  'interview',
  'offer',
  'mobilisation',
  'hired',
];

export const isSaudi = (nationality: string | null | undefined) =>
  (nationality ?? '').toUpperCase() === 'SA';

// The candidate workflow, mirrored client-side (the API decides — REC-04, DS-09,
// MOB-04b). One step forward, one step back, never out of a terminal stage, with
// two things particular to an Offer and to mobilisation:
//
//   - from OFFER a person coming from abroad goes to Visa & mobilisation, or — if
//     they are already in the Kingdom — straight to Onboarded; a Saudi national
//     has no visa steps, so Onboarded is their only way forward;
//   - nobody moves a candidate OUT of mobilisation by hand: finishing the
//     onboarding carries them to Onboarded, and there is no stepping back (their
//     employee record exists). They can still be withdrawn or not selected.
const FORWARD: Partial<Record<CandidateStage, CandidateStage>> = {
  applied: 'screening',
  screening: 'interview',
  interview: 'offer',
};
const BACK: Partial<Record<CandidateStage, CandidateStage>> = {
  screening: 'applied',
  interview: 'screening',
  offer: 'interview',
};

/** The forward moves a person may make, the usual one first. */
export function forwardOf(
  stage: CandidateStage,
  nationality: string | null | undefined,
): CandidateStage[] {
  if (stage === 'offer') return isSaudi(nationality) ? ['hired'] : ['mobilisation', 'hired'];
  const next = FORWARD[stage];
  return next ? [next] : [];
}
export const nextOf = (s: CandidateStage, nationality: string | null | undefined) =>
  forwardOf(s, nationality)[0] ?? null;
export const prevOf = (s: CandidateStage) => BACK[s] ?? null;
/** Still in the pipeline: rejected / withdrawn candidates leave the board. */
export const isActive = (s: CandidateStage) => s !== 'rejected' && s !== 'withdrawn';
/** A legal drop: a forward move this candidate may make, or the previous column. */
export const canDrop = (from: CandidateStage, to: Column, nationality: string | null | undefined) =>
  forwardOf(from, nationality).includes(to) || prevOf(from) === to;
