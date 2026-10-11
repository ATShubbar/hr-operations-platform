import { describe, expect, it } from 'vitest';
import { rtlSafeMessage, rtlSafeMessages } from './bidi.js';

// Written as escapes on purpose: an invisible character in a source file cannot
// be reviewed.
const RLM = '\u200f'; // right-to-left mark
const FSI = '\u2068'; // first-strong isolate
const PDI = '\u2069'; // pop directional isolate
const iso = (s: string) => `${FSI}${s}${PDI}`;

describe('rtlSafeMessage — the faults measured in the browser (UX-20)', () => {
  it('a sentence ending in a full stop gets a mark after it (the stop sat at the START)', () => {
    const m = 'تعذّر الحفظ. حاول مرة أخرى.';
    expect(rtlSafeMessage(m)).toBe(m + RLM);
  });

  it('an Arabic question mark, a colon, a bracket or a digit at the end is marked the same way', () => {
    for (const m of ['هل أنت متأكد؟', 'الاسم:', 'الإيصال (اختياري)', 'خلال 5', 'جارٍ الحفظ…']) {
      expect(rtlSafeMessage(m)).toBe(m + RLM);
    }
  });

  it('a name in the MIDDLE of a sentence is sealed off (the sentence was laid out in pieces)', () => {
    expect(rtlSafeMessage('أصبح {name} مسؤولًا عن هذا الملف.')).toBe(
      `أصبح ${iso('{name}')} مسؤولًا عن هذا الملف.${RLM}`,
    );
  });

  it('a name at the START is sealed off and the sentence is marked in front (a mark alone did nothing)', () => {
    expect(rtlSafeMessage('{name} يملك هذا الملف')).toBe(`${RLM}${iso('{name}')} يملك هذا الملف`);
  });

  it('a fixed English word at the END is sealed off and the sentence is marked behind it', () => {
    expect(rtlSafeMessage('طلبات بانتظار فريق PEOPLE&GRO')).toBe(
      `طلبات بانتظار فريق ${iso('PEOPLE&GRO')}${RLM}`,
    );
  });

  it('a leading number still reads from the right end (UX-18, now by rule)', () => {
    expect(rtlSafeMessage('{count} موظفًا')).toBe(`${RLM}${iso('{count}')} موظفًا`);
    expect(rtlSafeMessage('{from}–{to} يومًا')).toBe(`${RLM}${iso('{from}')}–${iso('{to}')} يومًا`);
    expect(rtlSafeMessage('3 طلبات')).toBe(`${RLM}3 طلبات`);
  });
});

describe('rtlSafeMessage — what it leaves alone', () => {
  it('a plain Arabic label is untouched', () => {
    for (const m of ['حفظ', 'الموظفون', 'مسندة إليّ', 'شكرًا', 'نشِط']) {
      expect(rtlSafeMessage(m)).toBe(m);
    }
  });

  it('a message with no Arabic is untouched, whatever it holds', () => {
    for (const m of ['PEOPLE&GRO', 'Save changes.', '{count} / {total}', '—', '', 'SAR {amount}']) {
      expect(rtlSafeMessage(m)).toBe(m);
    }
  });

  it('applying it twice changes nothing more', () => {
    for (const m of ['{name} يملك هذا الملف', 'تعذّر الحفظ.', 'ملف PDF من {name}.']) {
      const once = rtlSafeMessage(m);
      expect(rtlSafeMessage(once)).toBe(once);
    }
  });

  it('a message it cannot read (unbalanced braces) is returned as it came', () => {
    for (const m of ['أصبح {name مسؤولًا.', 'انتهى } الآن.']) {
      expect(rtlSafeMessage(m)).toBe(m);
    }
  });
});

describe('rtlSafeMessage — message syntax', () => {
  it('a plural is marked at both ends; its branch names and # are not touched', () => {
    const m = '{count, plural, one {طلب واحد} two {طلبان} other {# طلبات}}';
    expect(rtlSafeMessage(m)).toBe(RLM + m + RLM);
  });

  it('a select is marked at both ends; its branches keep their text', () => {
    const m = '{kind, select, onboarding {تهيئة} other {خروج نهائي}}';
    expect(rtlSafeMessage(m)).toBe(RLM + m + RLM);
  });

  it('names and English words INSIDE a branch are sealed off', () => {
    expect(
      rtlSafeMessage('{count, plural, one {ملف PDF واحد من {name}} other {# ملفات من {name}}}'),
    ).toBe(
      `${RLM}{count, plural, one {ملف ${iso('PDF')} واحد من ${iso('{name}')}} other {# ملفات من ${iso('{name}')}}}${RLM}`,
    );
  });

  it('text around a plural is handled like any other text', () => {
    expect(rtlSafeMessage('لدى {name} {count, plural, one {طلب} other {# طلبات}}.')).toBe(
      `لدى ${iso('{name}')} {count, plural, one {طلب} other {# طلبات}}.${RLM}`,
    );
  });

  it('a formatted number or date slot is sealed off like a plain one', () => {
    expect(rtlSafeMessage('المجموع {n, number} حتى {d, date, short}')).toBe(
      `المجموع ${iso('{n, number}')} حتى ${iso('{d, date, short}')}${RLM}`,
    );
  });

  it('link tags stay whole; the slot inside one is sealed off', () => {
    expect(
      rtlSafeMessage('تتطلب هذه الشاشة صلاحية <cap>{capability}</cap>. اطلب من المسؤول منحها لك.'),
    ).toBe(
      `تتطلب هذه الشاشة صلاحية <cap>${iso('{capability}')}</cap>. اطلب من المسؤول منحها لك.${RLM}`,
    );
    const links = 'تُدار من <clients>العملاء</clients> ثم <people>الموظفين</people>.';
    expect(rtlSafeMessage(links)).toBe(links + RLM);
  });
});

describe('rtlSafeMessage — English words', () => {
  it('several words in a row are one piece', () => {
    expect(rtlSafeMessage('يُحفظ في Google Calendar فقط')).toBe(
      `يُحفظ في ${iso('Google Calendar')} فقط`,
    );
    expect(rtlSafeMessage('المنطقة Asia/Riyadh دائمًا')).toBe(
      `المنطقة ${iso('Asia/Riyadh')} دائمًا`,
    );
  });

  it('the sentence’s own punctuation is never taken inside the piece', () => {
    expect(rtlSafeMessage('بحد أقصى 10 ميغابايت، PDF أو JPG أو PNG.')).toBe(
      `بحد أقصى 10 ميغابايت، ${iso('PDF')} أو ${iso('JPG')} أو ${iso('PNG')}.${RLM}`,
    );
  });

  it('a message that opens with an English word is marked in front', () => {
    expect(rtlSafeMessage('PDF أو صورة')).toBe(`${RLM}${iso('PDF')} أو صورة`);
  });
});

describe('rtlSafeMessages — a whole message file', () => {
  it('walks objects and lists, changes only strings, and does not alter its input', () => {
    const tree = {
      a: 'تم الحفظ.',
      b: { c: 'حفظ', list: ['بند {n}.', 'بند'] },
      n: 3,
    };
    const copy = JSON.parse(JSON.stringify(tree));
    expect(rtlSafeMessages(tree)).toEqual({
      a: `تم الحفظ.${RLM}`,
      b: { c: 'حفظ', list: [`بند ${iso('{n}')}.${RLM}`, 'بند'] },
      n: 3,
    });
    expect(tree).toEqual(copy);
  });
});
