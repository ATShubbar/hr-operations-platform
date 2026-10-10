import { describe, expect, it } from 'vitest';
import {
  bandAbove,
  bandBelow,
  bandWarning,
  NITAQAT_BANDS,
  RED_BAND_PROCEDURES,
  type NitaqatBand,
} from './client-profile.js';

// PROF-06 (ADR-019): ONE rule for every screen that warns about a Nitaqat band.
// A warning never blocks — it only decides whether a line of text is shown — so
// what matters is that the table below is exactly the ADR's:
//   Red    → a non-Saudi hire; a work-permit renewal; a sponsorship transfer.
//   Yellow → a non-Saudi hire only (renewals still pass).
//   Greens, Platinum, or no band recorded → never.
const GREENS: NitaqatBand[] = ['low_green', 'medium_green', 'high_green', 'platinum'];
const PROCEDURES = [
  'iqama_issue',
  'iqama_renewal',
  'exit_reentry',
  'final_exit',
  'profession_change',
  'sponsorship_transfer',
  'work_permit_renewal',
  'other',
];

describe('bandWarning (PROF-06)', () => {
  it('a non-Saudi hire warns on red and on yellow, and names which', () => {
    expect(bandWarning('red', { kind: 'hire', saudi: false })).toBe('red');
    expect(bandWarning('yellow', { kind: 'hire', saudi: false })).toBe('yellow');
  });

  it('a Saudi hire never warns — it is what a red or yellow band asks for', () => {
    for (const band of NITAQAT_BANDS) {
      expect(bandWarning(band, { kind: 'hire', saudi: true }), band).toBeNull();
    }
  });

  it('on red, exactly the work-permit renewal and the sponsorship transfer warn', () => {
    const warned = PROCEDURES.filter(
      (type) => bandWarning('red', { kind: 'procedure', type }) !== null,
    );
    expect(warned.sort()).toEqual(['sponsorship_transfer', 'work_permit_renewal']);
    expect([...RED_BAND_PROCEDURES].sort()).toEqual(warned);
    expect(bandWarning('red', { kind: 'procedure', type: 'work_permit_renewal' })).toBe('red');
  });

  it('on yellow, no procedure warns (renewals still pass)', () => {
    for (const type of PROCEDURES) {
      expect(bandWarning('yellow', { kind: 'procedure', type }), type).toBeNull();
    }
  });

  it('the green bands and platinum never warn, for anything', () => {
    for (const band of GREENS) {
      expect(bandWarning(band, { kind: 'hire', saudi: false }), band).toBeNull();
      for (const type of PROCEDURES) {
        expect(bandWarning(band, { kind: 'procedure', type }), `${band} ${type}`).toBeNull();
      }
    }
  });

  it('no band on file never warns — the app does not guess', () => {
    for (const none of [null, undefined]) {
      expect(bandWarning(none, { kind: 'hire', saudi: false })).toBeNull();
      expect(bandWarning(none, { kind: 'procedure', type: 'work_permit_renewal' })).toBeNull();
    }
  });
});

describe('the Nitaqat ladder', () => {
  it('runs worst first, and steps one band at a time', () => {
    expect(NITAQAT_BANDS[0]).toBe('red');
    expect(NITAQAT_BANDS.at(-1)).toBe('platinum');
    expect(bandAbove('red')).toBe('yellow');
    expect(bandAbove('high_green')).toBe('platinum');
    expect(bandAbove('platinum')).toBeNull();
    expect(bandBelow('yellow')).toBe('red');
    expect(bandBelow('red')).toBeNull();
  });
});
