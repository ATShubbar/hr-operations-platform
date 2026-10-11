'use client';

import { Children, Fragment, type ReactNode } from 'react';
import { useLocale } from 'next-intl';
import { DOT } from '@/lib/pieces';

// A dot-separated line whose pieces are not all text — a status pill, a link, a
// value already wrapped in an element (UX-22). For plain text use dots() from
// @/lib/pieces; this is the same rule for elements:
//
//   - empty pieces (null, false, blank text) are dropped with their separator;
//   - in Arabic every piece is sealed in a <bdi>, and the line is an inline run
//     with a right-to-left base, so the pieces go from the right, first piece
//     first, whatever language each is in.
//
// `text-end` keeps the line where it was: were this span ever stretched into a
// block (a flex column does that), a right-to-left base would push its text to
// the right-hand edge. In a right-to-left run, "end" is the left.
export function DotLine({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const pieces = Children.toArray(children).filter(
    (piece) => !(typeof piece === 'string' && piece.trim() === ''),
  );
  if (pieces.length < 2) return <>{pieces}</>;
  const rtl = locale === 'ar';
  const line = pieces.map((piece, i) => (
    // The pieces are positional: an index is the right key here.
    <Fragment key={i}>
      {i > 0 && DOT}
      {rtl ? <bdi>{piece}</bdi> : piece}
    </Fragment>
  ));
  return rtl ? (
    <span dir="rtl" className="text-end">
      {line}
    </span>
  ) : (
    <>{line}</>
  );
}
