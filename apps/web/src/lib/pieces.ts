// Lines assembled from several pieces (UX-22).
//
// "job · company · department" is built in code, piece by piece. In the Arabic
// view such a line read out of order whenever a piece was English — measured, 97
// of 226 lines on 23 screens: the browser put the English piece at the wrong end
// and the Arabic pieces around it swapped.
//
// `dots()` builds the line: empty pieces dropped, every piece sealed so it keeps
// its own direction, and in Arabic the whole line tied to run from the right —
// first piece first, whatever language each piece is in (an all-English line
// included: owner decision). In English it is a plain join.
//
// When a piece is not text (a status pill, a link), use <DotLine> instead.
// The lint rule `hr/no-hand-joined-line` forbids typing the separator anywhere
// else in the web app.
//
// The result is for DISPLAY: in Arabic it carries invisible characters.
import { rtlSafeJoin, type Piece } from '@hr/text';

/** The separator, for the one component that draws it between elements. */
export const DOT = ' · ';

/** `a · b · c`, in reading order in either language. */
export function dots(locale: string, ...pieces: Piece[]): string {
  return rtlSafeJoin(pieces, { rtl: locale === 'ar', separator: DOT });
}

/** The same with a plain space between the pieces: "Procedure #e470adc9". */
export function spaced(locale: string, ...pieces: Piece[]): string {
  return rtlSafeJoin(pieces, { rtl: locale === 'ar', separator: ' ' });
}
