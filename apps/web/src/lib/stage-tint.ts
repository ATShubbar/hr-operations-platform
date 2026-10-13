// The colour of a candidate's stage (HIRING-01; ADR-012 rev. 2).
//
// The second coloured category in the monochrome theme, after the department:
// on the Hiring sheet a candidate's stage is a soft pill, so the eye can follow
// the pipeline down a list that is no longer laid out as columns. The colour
// says WHICH STAGE — never how well the candidate is doing; that is the health
// pill's job, and it keeps the status tones.
//
// The two ways a candidate leaves the pipeline are grey: leaving is not a stage
// to be picked out.
//
// Pure data (no imports): `scripts/verify-tints.mjs` holds every pair to 4.5:1
// and every stage to a tint of its own, inside `pnpm lint`.

export interface StageTint {
  background: string;
  text: string;
}

const LEFT: StageTint = { background: '#f5f5f5', text: '#525252' };

export const STAGE_TINTS: Readonly<Record<string, StageTint>> = {
  applied: { background: '#eceff3', text: '#4b5565' }, // slate
  screening: { background: '#e2eefb', text: '#2c5d93' }, // blue
  interview: { background: '#edeafd', text: '#4f44b5' }, // violet
  offer: { background: '#fbe6ee', text: '#9b3e62' }, // rose
  mobilisation: { background: '#eef0dc', text: '#58611f' }, // olive
  hired: { background: '#e0f3ee', text: '#22685a' }, // teal
  rejected: LEFT,
  withdrawn: LEFT,
};

/** A stage's tint; a stage nobody has coloured yet is grey rather than missing. */
export const stageTint = (stage: string): StageTint => STAGE_TINTS[stage] ?? LEFT;
