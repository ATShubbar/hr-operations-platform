// The colour of a department's pill (PEOPLE-01; ADR-012 rev. 1).
//
// The app is monochrome; a department is the one exception the owner chose — a
// soft tint, so the eye can pick out who works together on the People list. The
// colour says "the same department" and nothing else: never good, bad, urgent
// or done (status keeps StatusPill and its own tones).
//
// A department is free text, so the tint is worked out from its name: the same
// name always lands on the same tint, whatever its capitals or the spaces
// around it. Two different departments may share a tint — the pill always
// carries the name, so the colour is never the only way to tell them apart.
//
// Pure data and a pure function (no imports), so `scripts/verify-department-
// tints.mjs` can hold every pair to 4.5:1 inside `pnpm lint`.

export interface DepartmentTint {
  /** The pill's ground: a pale tint on the white card. */
  background: string;
  /** The department's name on it — at least 4.5:1 against the ground. */
  text: string;
}

export const DEPARTMENT_TINTS: readonly DepartmentTint[] = [
  { background: '#edeafd', text: '#4f44b5' }, // violet
  { background: '#e0f3ee', text: '#22685a' }, // teal
  { background: '#fdeadf', text: '#9c4e24' }, // orange
  { background: '#e2eefb', text: '#2c5d93' }, // blue
  { background: '#fbe6ee', text: '#9b3e62' }, // rose
  { background: '#eef0dc', text: '#58611f' }, // olive
];

export function tintFor(department: string): DepartmentTint {
  let hash = 0;
  for (const ch of department.trim().toLowerCase()) {
    hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) % 9973;
  }
  return DEPARTMENT_TINTS[hash % DEPARTMENT_TINTS.length]!;
}
