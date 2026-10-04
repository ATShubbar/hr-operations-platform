import type { CandidateStage } from '@hr/contracts';

// The hiring board's columns (DS-09), in the prototype's order. Five are real
// candidate stages; `visa` is the prototype's "Visa & mobilisation", which needs
// the onboarding feature (FEAT) — the column is shown, marked "coming soon", and
// is never a drop target. Until it exists, an Offer moves straight to Onboarded
// (`hired`), which creates the employee record (REC-05).
export type Column = Exclude<CandidateStage, 'rejected' | 'withdrawn'> | 'visa';
export const COLUMNS: readonly Column[] = [
  'applied',
  'screening',
  'interview',
  'offer',
  'visa',
  'hired',
];

// The candidate workflow, mirrored client-side (the API decides — REC-04, DS-09):
// one step forward, one step back, never out of a terminal stage.
const FORWARD: Partial<Record<CandidateStage, CandidateStage>> = {
  applied: 'screening',
  screening: 'interview',
  interview: 'offer',
  offer: 'hired',
};
const BACK: Partial<Record<CandidateStage, CandidateStage>> = {
  screening: 'applied',
  interview: 'screening',
  offer: 'interview',
};
export const nextOf = (s: CandidateStage) => FORWARD[s] ?? null;
export const prevOf = (s: CandidateStage) => BACK[s] ?? null;
/** Still in the pipeline: rejected / withdrawn candidates leave the board. */
export const isActive = (s: CandidateStage) => s !== 'rejected' && s !== 'withdrawn';
/** A legal drop: the next column or the previous one. */
export const canDrop = (from: CandidateStage, to: Column) =>
  to !== 'visa' && (nextOf(from) === to || prevOf(from) === to);
