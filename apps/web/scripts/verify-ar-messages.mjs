// UX-20: the Arabic messages and the rule that keeps them in reading order.
//
// The layout is left to right in both languages (ADR-012). `rtlSafeMessages`
// (@hr/text) ties each Arabic message's numbers, names and final punctuation into
// it when the app loads the file (src/i18n/request.ts). This check, run by
// `pnpm lint`, keeps two promises about `messages/ar.json`:
//
//   1. The file is PLAIN TEXT. No directional control character, written out or
//      as an escape — the rule adds them, and a hand-placed one would make the
//      rule skip that message. (UX-18 kept such marks in the file; they are gone.)
//
//   2. The rule changes NOTHING a reader can see except the order. Every message
//      is formatted twice by the library the app uses — as written, and after the
//      rule — with sample values that reach every plural and select branch. The
//      two results must be identical once the invisible characters are removed,
//      and neither may fail to format.
//
// Escapes are written as \u so this file survives editors that mangle
// bidirectional text.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rtlSafeMessage } from '@hr/text';
import { createTranslator } from 'next-intl';

const FILE = fileURLToPath(new URL('../messages/ar.json', import.meta.url));
const CONTROLS = /[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g;
const ESCAPED_CONTROL = /\\u(?:200[ef]|061c|202[a-e]|206[6-9])/i;
// One number per Arabic plural form: zero, one, two, few, many, other.
const PLURAL_SAMPLES = [0, 1, 2, 3, 11, 100];

/** Every string in the tree, with the path that leads to it. */
function* strings(node, path = '') {
  for (const [key, value] of Object.entries(node)) {
    const here = path ? `${path}.${key}` : key;
    if (typeof value === 'string') yield [here, value];
    else if (value && typeof value === 'object') yield* strings(value, here);
  }
}

/** The index of the brace that closes the one at `open`, or -1. */
function closing(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

/** What a message asks for: its slots by kind, and the tags it wraps text in. */
function shape(message) {
  const plain = new Set();
  const numbers = new Set();
  const dates = new Set();
  const selects = new Map();
  const visit = (text) => {
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== '{') continue;
      const end = closing(text, i);
      if (end < 0) return;
      const body = text.slice(i + 1, end);
      const head = /^\s*(\w+)\s*(?:,\s*(\w+)\s*(?:,([\s\S]*))?)?$/.exec(body);
      if (head) {
        const [, name, kind, rest] = head;
        if (!kind) plain.add(name);
        else if (kind === 'plural' || kind === 'selectordinal' || kind === 'number')
          numbers.add(name);
        else if (kind === 'date' || kind === 'time') dates.add(name);
        else if (kind === 'select') {
          const keys = selects.get(name) ?? new Set();
          for (let j = 0; j < rest.length; j++) {
            if (rest[j] !== '{') continue;
            const key = /(\S+)\s*$/.exec(rest.slice(0, j));
            if (key) keys.add(key[1]);
            j = closing(rest, j);
            if (j < 0) break;
          }
          selects.set(name, keys);
        }
        if (rest) visit(rest);
      } else {
        // A branch body: look inside it.
        visit(body);
      }
      i = end;
    }
  };
  visit(message);
  const tags = new Set([...message.matchAll(/<(\w+)\s*\/?>/g)].map((m) => m[1]));
  return { plain, numbers, dates, selects, tags };
}

/** Value sets that between them reach every branch of the message. */
function samples({ plain, numbers, dates, selects, tags }) {
  const base = {};
  for (const name of plain) base[name] = 'Abc';
  for (const name of numbers) base[name] = 3;
  for (const name of dates) base[name] = new Date(Date.UTC(2026, 9, 11));
  for (const [name, keys] of selects) base[name] = [...keys][0] ?? 'other';
  for (const tag of tags) base[tag] = (chunks) => `<${tag}>${chunks}</${tag}>`;
  const sets = [base];
  for (const name of numbers) for (const n of PLURAL_SAMPLES) sets.push({ ...base, [name]: n });
  for (const [name, keys] of selects) for (const key of keys) sets.push({ ...base, [name]: key });
  return sets;
}

const raw = readFileSync(FILE, 'utf8');
const problems = [];

if (ESCAPED_CONTROL.test(raw) || raw.search(CONTROLS) >= 0) {
  problems.push(
    'messages/ar.json holds a directional control character (a mark or an isolate). ' +
      'Remove it: the rule in @hr/text adds them when the file is loaded.',
  );
}

const entries = [...strings(JSON.parse(raw))];
const written = {};
const ruled = {};
entries.forEach(([, message], i) => {
  written[`m${i}`] = message;
  ruled[`m${i}`] = rtlSafeMessage(message);
});

let failure = null;
const translator = (messages) =>
  createTranslator({
    locale: 'ar',
    messages,
    timeZone: 'UTC',
    onError: (error) => {
      failure = error.message;
    },
    getMessageFallback: () => '',
  });
const asWritten = translator(written);
const afterRule = translator(ruled);

let changed = 0;
entries.forEach(([path, message], i) => {
  const key = `m${i}`;
  if (ruled[key] !== message) changed++;
  for (const values of samples(shape(message))) {
    failure = null;
    const before = asWritten.markup(key, values);
    if (failure) {
      problems.push(`${path}: does not format — ${failure}`);
      break;
    }
    const after = afterRule.markup(key, values);
    if (failure) {
      problems.push(`${path}: does not format after the rule — ${failure}`);
      break;
    }
    if (after.replace(CONTROLS, '') !== before.replace(CONTROLS, '')) {
      problems.push(`${path}: the rule changed the text — "${before}" became "${after}"`);
      break;
    }
  }
});

if (problems.length > 0) {
  console.error(`Arabic messages (UX-20):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(
  `Arabic messages: ${entries.length} checked, plain text in the file; the rule marks ${changed} and changes the wording of none.`,
);
