// PEOPLE-01, HIRING-01: the category colours.
//
// The theme is monochrome; two CATEGORIES are coloured by owner decision (ADR-012
// rev. 1 and 2): a person's department, and a candidate's stage. Three promises
// are kept here, inside `pnpm lint`:
//
//   1. Every tint is READABLE: its text on its background is at least 4.5:1 (WCAG
//      AA for small text). The first drawing of these colours measured 2.9–4.2.
//   2. A department always gets the SAME tint — whatever its capitals or the
//      spaces around it — so the colour can only ever mean "same department".
//   3. Every candidate stage has a tint of its own to the same standard, and the
//      two ways a candidate leaves the pipeline stay grey.
//
// Run with Node's type stripping: the module is TypeScript with no imports.
import assert from 'node:assert/strict';
import { DEPARTMENT_TINTS, tintFor } from '../src/lib/department-tint.ts';
import { STAGE_TINTS } from '../src/lib/stage-tint.ts';

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

assert.ok(DEPARTMENT_TINTS.length >= 4, 'too few tints to tell departments apart');
const problems = [];
const STAGES = [
  'applied',
  'screening',
  'interview',
  'offer',
  'mobilisation',
  'hired',
  'rejected',
  'withdrawn',
];
assert.deepEqual(
  Object.keys(STAGE_TINTS).sort(),
  [...STAGES].sort(),
  'a candidate stage has no tint, or a tint has no stage',
);
// The pipeline's stages are told apart; leaving it is not a colour.
const inPlay = STAGES.slice(0, 6).map((s) => STAGE_TINTS[s].background);
assert.equal(new Set(inPlay).size, inPlay.length, 'two pipeline stages share a tint');
assert.deepEqual(STAGE_TINTS.rejected, STAGE_TINTS.withdrawn);

for (const tint of [...DEPARTMENT_TINTS, ...Object.values(STAGE_TINTS)]) {
  for (const colour of [tint.background, tint.text]) {
    assert.match(colour, /^#[0-9a-f]{6}$/, `${colour} is not a six-digit hex colour`);
  }
  const ratio = contrast(tint.background, tint.text);
  if (ratio < 4.5) {
    problems.push(`${tint.text} on ${tint.background} is ${ratio.toFixed(2)}:1 — below 4.5:1`);
  }
  // Soft, as chosen: the background stays a pale tint on the white card.
  if (contrast(tint.background, '#ffffff') > 1.35) {
    problems.push(`${tint.background} is not a pale tint`);
  }
}
if (problems.length > 0) {
  console.error(
    `Category colours (PEOPLE-01, HIRING-01):\n${problems.map((p) => `  - ${p}`).join('\n')}`,
  );
  process.exit(1);
}

// The same department, the same tint — every time, however it was typed.
assert.equal(tintFor('Finance'), tintFor('Finance'));
assert.equal(tintFor('Finance'), tintFor('  finance '));
assert.equal(tintFor('Finance'), tintFor('FINANCE'));
assert.equal(tintFor('المالية'), tintFor(' المالية'));
// And departments do spread over the palette rather than all landing on one.
const used = new Set(
  [
    'Finance',
    'Operations',
    'Warehouse',
    'Projects',
    'Clinical',
    'Logistics',
    'Sales',
    'IT',
    'Maintenance',
    'Administration',
  ].map((d) => tintFor(d).background),
);
assert.ok(used.size >= 4, `ten departments share only ${used.size} tints`);

const lowest = Math.min(
  ...[...DEPARTMENT_TINTS, ...Object.values(STAGE_TINTS)].map((t) =>
    contrast(t.background, t.text),
  ),
);
console.log(
  `Category colours: ${DEPARTMENT_TINTS.length} department tints and ${STAGES.length} stage tints, the least readable at ${lowest.toFixed(2)}:1; the same department always gets the same one.`,
);
