// Arabic search normalisation (UX-03).
//
// THE PROBLEM this exists to solve, measured before it was written:
//
//   'أحمد حسن'.includes('احمد')  →  false
//   'إدارة'.includes('ادارة')     →  false
//   'إجازة'.includes('اجازه')     →  false
//   'مصطفى'.includes('مصطفي')     →  false
//
// All four queries are the ordinary way people type those words — the hamza on an
// alef is routinely omitted, ة and ه are used interchangeably at word end, and ى
// and ي are frequently swapped. A naive search matches by UTF-16 code unit, so the
// record does not rank low; it VANISHES. On a product whose default language is
// Arabic, a search box without this is worse than no search box, because it fails
// silently and the user concludes the record isn't there.
//
// `toLowerCase()` does nothing here — Arabic has no case. `Intl.Collator` can
// compare but cannot transform, so it can't feed a substring match, and it misses
// alef madda and teh marbuta anyway. NFKC alone fixes nothing. Hence an explicit
// fold, mirroring Lucene's ArabicNormalizer (which is what Elasticsearch's
// arabic_normalization filter uses) plus digit folding.
//
// Shared package on purpose: when server-side search lands it MUST use the same
// fold, or the client and the API disagree about what matches — a confusing bug to
// chase. Escapes are written as \u so the source survives editors that mangle
// bidirectional text.

export function normalizeForSearch(input: string): string {
  return (
    input
      // Decomposes أ إ آ into alef + a combining mark, and folds Arabic
      // Presentation Forms (U+FE70–FEFF) that arrive when text is pasted out of
      // PDFs or older government systems — very relevant to Qiwa/Muqeem data.
      .normalize('NFKD')
      // Strips harakat AND the hamza/madda marks the decomposition just produced.
      // One rule for both jobs, which is why NFKD comes first.
      .replace(/\p{M}/gu, '')
      .replace(/ـ/g, '') // tatweel (kashida), a pure decoration
      // Residual alef variants → bare alef
      .replace(/[آأإٱٲٳ]/g, 'ا')
      .replace(/ة/g, 'ه') // ة → ه
      .replace(/ى/g, 'ي') // ى → ي
      // Arabic-Indic and extended (Persian) digits → ASCII, so ١٢٣ finds 123
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      // Invisible bidi controls that ride along in pasted text
      .replace(/[\u200B-\u200F\u061C\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
      .toLowerCase() // no-op for Arabic; folds Latin, which we also search
      .replace(/\s+/g, ' ')
      .trim()
  );
}

// Deliberately NOT folded: ؤ and ئ → ء. Lucene normalises hamza only on an alef
// seat, and folding the others merges genuinely distinct words. Add it only if a
// real query proves the need.

/** Does `haystack` contain `needle`, ignoring Arabic orthographic variation? */
export function matchesSearch(haystack: string, needle: string): boolean {
  const q = normalizeForSearch(needle);
  if (!q) return true;
  return normalizeForSearch(haystack).includes(q);
}

/**
 * Does any of `fields` match? Used by list search, where a query should hit a
 * name, a job title or an identifier without the user choosing which.
 */
export function matchesAnyField(
  fields: readonly (string | null | undefined)[],
  needle: string,
): boolean {
  const q = normalizeForSearch(needle);
  if (!q) return true;
  return fields.some((f) => (f ? normalizeForSearch(f).includes(q) : false));
}
