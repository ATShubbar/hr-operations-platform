// Measures the UX-01 semantic status tokens: OKLCH → sRGB → WCAG contrast, so
// the ratios in evidence/ux/UX-01.md are measured rather than asserted.
//
//   node apps/web/scripts/verify-status-contrast.mjs
//
// The values below MIRROR :root in src/app/globals.css — if you change a token
// there, change it here and re-run. (Not wired into CI: it is a design-time
// check for whoever touches the palette, not a per-commit gate.)
function oklchToLinear(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, v)));
}
const relLum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const ratio = (c1, c2) => {
  const a = relLum(oklchToLinear(...c1)), b = relLum(oklchToLinear(...c2));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
};
const hex = (c) => '#' + oklchToLinear(...c)
  .map((v) => Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) * 255)
    .toString(16).padStart(2, '0')).join('');

const BG   = [0.975, 0.003, 95];   // proposed --background
const CARD = [1, 0, 0];            // --card stays white

const T = {
  critical: { fg: [0.43, 0.17, 25],  surface: [0.96, 0.022, 25],  line: [0.84, 0.07, 25] },
  warning:  { fg: [0.48, 0.13, 55],  surface: [0.965, 0.03, 70],  line: [0.84, 0.09, 65] },
  ok:       { fg: [0.48, 0.12, 155], surface: [0.965, 0.028, 158],line: [0.84, 0.07, 155] },
  info:     { fg: [0.47, 0.16, 260], surface: [0.965, 0.022, 253],line: [0.84, 0.06, 256] },
  neutral:  { fg: [0.50, 0.012, 285], surface: [0.968, 0.002, 285],line: [0.87, 0.004, 285] },
};

console.log('SURFACE LAYERING');
console.log('  --background', hex(BG), ' --card', hex(CARD),
  '→', ratio(BG, CARD).toFixed(2) + ':1 (a layering cue; no WCAG minimum applies)');

console.log('\nTONE COLOUR  --status-X  (carries text, dots and icons)');
console.log('  tone      hex      on surface (need 4.5)   on card (need 4.5)   as dot on card (need 3.0)');
for (const [name, t] of Object.entries(T)) {
  const s1 = ratio(t.fg, t.surface), s2 = ratio(t.fg, CARD);
  const v = (r, min) => (r.toFixed(2) + ':1 ' + (r >= min ? 'PASS' : 'FAIL')).padEnd(22);
  console.log('  ', name.padEnd(9), hex(t.fg), v(s1, 4.5), v(s2, 4.5), v(s2, 3.0));
}

console.log('\nDECORATIVE HAIRLINE  --status-X-line  (NOT load-bearing: 1.4.11 exempts the');
console.log('boundary of a control whose meaning is carried by its own visible text)');
for (const [name, t] of Object.entries(T)) {
  console.log('  ', name.padEnd(9), hex(t.line), ratio(t.line, BG).toFixed(2) + ':1 vs page');
}

console.log('\nSURFACE TINT vs page — why an UNLABELLED fill must use the tone, not the tint:');
for (const [name, t] of Object.entries(T)) {
  console.log('  ', name.padEnd(9), hex(t.surface), ratio(t.surface, BG).toFixed(2) + ':1  (a bar drawn in this would be invisible)');
}

console.log('\nGREYSCALE SEPARATION of the tone colours (relative luminance, ascending):');
const ramp = Object.entries(T).map(([n, t]) => [n, relLum(oklchToLinear(...t.fg))]).sort((a, b) => a[1] - b[1]);
ramp.forEach(([n, l]) => console.log('  ', n.padEnd(9), l.toFixed(4)));
console.log('  → critical is clearly darkest. The middle three are close: a monotonic greyscale');
console.log('    ramp across five hues is INCOMPATIBLE with holding all five at 4.5:1 on a light');
console.log('    tint. Non-colour redundancy therefore comes from the label + icon (UX-02),');
console.log('    which is what WCAG 1.4.1 actually requires. Ordered data uses --chart-1..5.');
