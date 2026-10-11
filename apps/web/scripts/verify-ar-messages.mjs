// UX-18: an Arabic message that OPENS with a number reads at the wrong end.
//
// The layout is left-to-right in both languages (ADR-012). In a left-to-right
// line, a string such as "8–14 يومًا" is drawn with the number on the LEFT of
// the word — measured: "8" at x=564, the word at x=594 — so an Arabic reader,
// reading from the right, meets the word first and the number last.
//
// The fix lives in the message itself: a right-to-left mark (U+200F, written
// as the escape \u200f so it is VISIBLE in review) before the number. The mark
// is invisible and has no width; it makes the number part of the Arabic run, so
// it is drawn at the right-hand end, where the sentence starts.
//
// This check keeps it that way. It fails when an Arabic message — or one branch
// of a plural / select — starts with a digit, "#" or a {placeholder} (which may
// carry a number, a date or a Latin name) without the mark. A placeholder that
// turns out to hold Arabic text is unaffected by the mark, so the rule needs no
// list of "numeric" placeholders to maintain.
//
// It also fails if the mark appears as a literal character: an invisible
// character in a text file cannot be reviewed.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FILE = fileURLToPath(new URL('../messages/ar.json', import.meta.url));
const RLM = '\u200f';
const ARABIC = /[\u0600-\u06ff]/;

/** The top level of a message, and the body of every plural / select branch in it. */
function* bodies(message) {
  yield message;
  for (let i = 0; i < message.length; i++) {
    if (message[i] !== '{') continue;
    const head = /^\{\s*\w+\s*,\s*(plural|select|selectordinal)\s*,/.exec(message.slice(i));
    if (!head) continue;
    let j = i + head[0].length;
    let depth = 1;
    while (j < message.length && depth > 0) {
      if (message[j] === '{' && depth === 1) {
        let k = j + 1;
        let inner = 1;
        while (k < message.length && inner > 0) {
          if (message[k] === '{') inner++;
          else if (message[k] === '}') inner--;
          k++;
        }
        yield* bodies(message.slice(j + 1, k - 1));
        j = k;
        continue;
      }
      if (message[j] === '{') depth++;
      else if (message[j] === '}') depth--;
      j++;
    }
    i = j;
  }
}

/** True when this text is Arabic and starts with a number or a placeholder, unmarked. */
export function needsMark(text) {
  const t = text.trimStart();
  if (!t || !ARABIC.test(t) || t.startsWith(RLM)) return false;
  if (t[0] === '#' || /\d/.test(t[0])) return true;
  // A plain placeholder ({count}, {date}, {n, number}) — not a plural / select wrapper.
  return /^\{\s*\w+\s*(,\s*number[^}]*)?\}/.test(t);
}

function walk(node, path, problems) {
  for (const [key, value] of Object.entries(node)) {
    const here = path ? `${path}.${key}` : key;
    if (typeof value === 'string') {
      for (const body of bodies(value)) {
        if (needsMark(body)) problems.push(`${here}: "${body.trim().slice(0, 50)}"`);
      }
    } else if (value && typeof value === 'object') {
      walk(value, here, problems);
    }
  }
}

const raw = readFileSync(FILE, 'utf8');
const problems = [];
if (raw.includes(RLM)) {
  problems.push(
    'messages/ar.json holds a LITERAL right-to-left mark. Write it as the escape \\u200f so it can be seen.',
  );
}
walk(JSON.parse(raw), '', problems);

if (problems.length > 0) {
  console.error(
    `Arabic messages that open with a number or a placeholder need \\u200f in front (UX-18):\n` +
      problems.map((p) => `  - ${p}`).join('\n'),
  );
  process.exit(1);
}
console.log('Arabic messages: every one that opens with a number or a placeholder is marked.');
