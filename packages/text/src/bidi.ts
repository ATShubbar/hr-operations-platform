// Arabic messages in a left-to-right layout (UX-20).
//
// The layout runs left to right in both languages (ADR-012). A browser lays an
// Arabic message out correctly only while the message is ONE right-to-left run.
// Three things break that, each measured in the browser before this was written
// (positions are the x of each piece; an Arabic line starts at the RIGHT):
//
//   1. It ends in punctuation.        "تعذّر الحفظ."            the stop at x 158, the first
//                                                             word at x 133 — the stop is
//                                                             drawn BEFORE the sentence.
//   2. It holds an English name.      "أصبح Huda … مسؤولًا"     first word x 0, name x 37,
//                                                             rest x 235 — three pieces
//                                                             laid out left to right.
//   3. It opens with a name or number. "Huda … يملك هذا الملف"   the name at x 0, the far
//                                                             (wrong) end.
//
// What fixes them, also measured:
//   - a right-to-left MARK at an end that is not an Arabic letter (fixes 1, and a
//     leading number). A mark does nothing for 2 or 3: an English run keeps its
//     own direction whatever stands beside it;
//   - sealing each slot and each English word in an ISOLATE, so the sentence
//     around it stays one run and the piece sits inside it (fixes 2 and 3).
//
// Wrapping the WHOLE message in a right-to-left isolate would be simpler and was
// rejected: measured, it reverses the order of lines assembled from several
// pieces ("target date · Hijri date"), which read correctly today.
//
// The rule is applied to the Arabic messages when the web app loads them, so
// `messages/ar.json` stays plain text with no invisible characters in it.
//
// Escapes are written as \u so this file survives editors that mangle
// bidirectional text.

const RLM = '\u200f'; // right-to-left mark
const FSI = '\u2068'; // first-strong isolate: takes its direction from its content
const PDI = '\u2069'; // closes an isolate

/** Any directional control. A message that already holds one is left alone. */
const CONTROLS = /[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/;
/** Arabic letters — the characters with a strong right-to-left direction. */
const ARABIC_LETTER = /[\u0620-\u064a\u066e-\u06d3\u06d5\u06fa-\u06ff]/;
/** Marks that sit ON a letter (harakat); they take the direction of that letter. */
const TRAILING_MARKS = /[\u064b-\u065f\u0670\u06d6-\u06ed]+$/;
/** English words: letters and digits, joined by spaces or by & + . / _ ' -. Ends on a letter or digit, so the sentence's own punctuation stays outside. */
const LATIN_RUN = /[A-Za-z][A-Za-z0-9]*(?:[ &+./_'-]+[A-Za-z0-9]+)*/g;
/** {name} · {n, number} · {d, date, short} */
const SLOT = /^\s*\w+\s*(?:,\s*(?:number|date|time)\b[^{}]*)?$/;
/** {count, plural, …} · {kind, select, …} — the head, then the branches. */
const BRANCHING = /^(\s*\w+\s*,\s*(?:plural|select|selectordinal)\s*,)([\s\S]*)$/;
const TAG = /^<\/?\w+\s*\/?>/;

class Unreadable extends Error {}

const isolate = (s: string) => `${FSI}${s}${PDI}`;

/** The index of the brace that closes the one at `open`. */
function closing(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  throw new Unreadable();
}

/** `one {…} other {…}`: branch names are copied, branch bodies are transformed. */
function branches(text: string): string {
  let out = '';
  for (let i = 0; i < text.length;) {
    if (text[i] === '{') {
      const end = closing(text, i);
      out += `{${inner(text.slice(i + 1, end))}}`;
      i = end + 1;
    } else if (text[i] === '}') {
      throw new Unreadable();
    } else {
      out += text[i++];
    }
  }
  return out;
}

/** Seals off every slot and every English word; leaves the ends alone. */
function inner(text: string): string {
  let out = '';
  let plain = '';
  const flush = () => {
    out += plain.replace(LATIN_RUN, isolate);
    plain = '';
  };
  for (let i = 0; i < text.length;) {
    const ch = text[i];
    if (ch === '<') {
      const tag = TAG.exec(text.slice(i));
      if (tag) {
        flush();
        out += tag[0];
        i += tag[0].length;
        continue;
      }
    }
    if (ch === '{') {
      const end = closing(text, i);
      const body = text.slice(i + 1, end);
      const branching = BRANCHING.exec(body);
      flush();
      if (SLOT.test(body)) out += isolate(`{${body}}`);
      else if (branching) out += `{${branching[1]}${branches(branching[2]!)}}`;
      else out += `{${body}}`;
      i = end + 1;
      continue;
    }
    if (ch === '}') throw new Unreadable();
    plain += ch;
    i++;
  }
  flush();
  return out;
}

/**
 * Make one Arabic message safe to draw in a left-to-right layout. A message with
 * no Arabic letter, or one that already carries a directional control, or one
 * whose braces do not balance, is returned exactly as it came.
 */
export function rtlSafeMessage(message: string): string {
  if (!ARABIC_LETTER.test(message) || CONTROLS.test(message)) return message;
  let body: string;
  try {
    body = inner(message);
  } catch (err) {
    if (err instanceof Unreadable) return message;
    throw err;
  }
  const first = message.trimStart()[0] ?? '';
  const last = message.trimEnd().replace(TRAILING_MARKS, '').slice(-1);
  return (ARABIC_LETTER.test(first) ? '' : RLM) + body + (ARABIC_LETTER.test(last) ? '' : RLM);
}

/** The same, for a whole tree of messages (objects and lists). Returns a copy. */
export function rtlSafeMessages<T>(tree: T): T {
  if (typeof tree === 'string') return rtlSafeMessage(tree) as T;
  if (Array.isArray(tree)) return tree.map((item) => rtlSafeMessages(item)) as T;
  if (tree && typeof tree === 'object') {
    return Object.fromEntries(
      Object.entries(tree).map(([key, value]) => [key, rtlSafeMessages(value)]),
    ) as T;
  }
  return tree;
}
