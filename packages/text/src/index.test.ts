import { describe, expect, it } from 'vitest';
import { matchesAnyField, matchesSearch, normalizeForSearch } from './index.js';

// The cases that motivated this package. Each `naive` assertion documents what a
// plain includes() does, so the regression these guard against stays visible: if
// someone "simplifies" the normaliser away, these fail loudly rather than the
// search quietly returning nothing.
describe('Arabic orthographic variants that a naive search misses entirely', () => {
  const cases: { data: string; query: string; why: string }[] = [
    { data: 'أحمد حسن', query: 'احمد', why: 'hamza above alef omitted — the common way to type it' },
    { data: 'إدارة', query: 'ادارة', why: 'hamza below alef omitted' },
    { data: 'آل سعود', query: 'ال سعود', why: 'alef madda typed as bare alef' },
    { data: 'إجازة', query: 'اجازه', why: 'teh marbuta typed as heh, plus hamza' },
    { data: 'مصطفى', query: 'مصطفي', why: 'alef maksura typed as yeh' },
    { data: 'مُوَظَّف', query: 'موظف', why: 'harakat present in the data, absent in the query' },
    { data: 'طلـــب', query: 'طلب', why: 'tatweel padding in the data' },
    { data: 'إقامة ١٢٣٤', query: '1234', why: 'Arabic-Indic digits vs ASCII' },
    { data: 'رقم ۱۲۳', query: '123', why: 'extended (Persian) Arabic-Indic digits' },
  ];

  for (const { data, query, why } of cases) {
    it(`finds "${query}" in "${data}" — ${why}`, () => {
      expect(data.includes(query)).toBe(false); // what we would have shipped
      expect(matchesSearch(data, query)).toBe(true); // what we ship
    });
  }
});

describe('normalizeForSearch', () => {
  it('folds every alef variant to a bare alef', () => {
    for (const v of ['أ', 'إ', 'آ', 'ٱ']) {
      expect(normalizeForSearch(v)).toBe('ا');
    }
  });

  it('is idempotent', () => {
    const once = normalizeForSearch('أحمد إجازة ١٢٣');
    expect(normalizeForSearch(once)).toBe(once);
  });

  it('collapses whitespace and trims', () => {
    expect(normalizeForSearch('  احمد   حسن  ')).toBe('احمد حسن');
  });

  it('strips invisible bidi controls that ride along in pasted text', () => {
    expect(normalizeForSearch('‏احمد‎')).toBe('احمد');
  });

  it('does not merge genuinely distinct hamza carriers', () => {
    // ؤ / ئ are deliberately left alone — folding them to ء over-merges words.
    expect(normalizeForSearch('مسؤول')).not.toBe(normalizeForSearch('مسئول'));
  });

  it('folds Latin case and accents too, since the same box searches both', () => {
    expect(matchesSearch('Café Ahmed', 'cafe')).toBe(true);
    expect(matchesSearch('Ahmed Hassan', 'AHMED')).toBe(true);
  });
});

describe('behaviour that must not regress', () => {
  it('an empty query matches everything (it is not a filter yet)', () => {
    expect(matchesSearch('anything', '')).toBe(true);
    expect(matchesSearch('anything', '   ')).toBe(true);
  });

  it('still rejects genuine non-matches — the fold must not match everything', () => {
    expect(matchesSearch('أحمد حسن', 'راجيش')).toBe(false);
    expect(matchesSearch('Employment Contract', 'iqama')).toBe(false);
  });

  it('matchesAnyField searches across fields and tolerates nulls', () => {
    const row = ['أحمد حسن', null, 'محاسب', undefined, '2345678901'];
    expect(matchesAnyField(row, 'احمد')).toBe(true); // name
    expect(matchesAnyField(row, 'محاسب')).toBe(true); // job title
    expect(matchesAnyField(row, '234567')).toBe(true); // identifier
    expect(matchesAnyField(row, 'راجيش')).toBe(false);
  });
});
