import { describe, expect, it } from 'vitest';
import { normalizeName } from './normalize.js';

describe('normalizeName', () => {
  it.each([
    // charter examples
    ['José', 'jose'],
    ['Åsa', 'asa'],
    // case folding
    ['SOPHIA', 'sophia'],
    ['Kai', 'kai'],
    ['ÉLODIE', 'elodie'],
    // trim + internal whitespace collapsing
    ['  Mary   Jane ', 'mary jane'],
    ['Ana\t\n Mar\u00ed\u0301a', 'ana maria'], // tab/newline between words, combining acute
    // NFKD compatibility folding (fullwidth → ASCII)
    ['ＡＮＮＡ', 'anna'],
    // diacritics fold via combining-mark strip after NFKD
    ['Zoë', 'zoe'],
    ['Björn', 'bjorn'],
    ['Inés', 'ines'],
    // already-normalized input is unchanged
    ['oliver', 'oliver'],
  ])('normalizeName(%j) → %j', (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });

  it('collapses all whitespace runs to single spaces and trims both ends', () => {
    expect(normalizeName('\u00a0\u2009 Luna \u2003 Grace \t\n Bailey ')).toBe(
      normalizeName('Luna Grace Bailey'),
    );
  });

  it('distinct diacritic spellings fold to the same key (merge prerequisite)', () => {
    expect(normalizeName('Sofia')).toBe(normalizeName('Sofía'));
    expect(normalizeName('Jose')).toBe(normalizeName('José'));
  });
});
