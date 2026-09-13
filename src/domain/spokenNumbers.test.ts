import { describe, expect, it } from 'vitest';
import { normaliseSpokenAmount } from './spokenNumbers';
import { parseEntryText } from './parseEntry';

const NOW = new Date(2026, 8, 13, 12, 0, 0);

describe('normaliseSpokenAmount', () => {
  it('leaves typed text alone', () => {
    // Runs over everything, dictated or not, so it must be a no-op on digits.
    expect(normaliseSpokenAmount('12.50 tesco')).toBe('12.50 tesco');
    expect(normaliseSpokenAmount('45 fuel yesterday')).toBe('45 fuel yesterday');
    expect(normaliseSpokenAmount('')).toBe('');
  });

  it('turns spoken numbers into digits', () => {
    expect(normaliseSpokenAmount('forty five fuel')).toBe('45 fuel');
    expect(normaliseSpokenAmount('twelve tesco')).toBe('12 tesco');
    expect(normaliseSpokenAmount('seven coffee')).toBe('7 coffee');
  });

  it('handles hundreds and thousands', () => {
    expect(normaliseSpokenAmount('one hundred and five rent')).toBe('105 rent');
    expect(normaliseSpokenAmount('two hundred tesco')).toBe('200 tesco');
    expect(normaliseSpokenAmount('one thousand two hundred and fifty rent')).toBe('1250 rent');
    expect(normaliseSpokenAmount('a hundred fuel')).toBe('100 fuel');
  });

  it('reads a decimal spoken as "point"', () => {
    expect(normaliseSpokenAmount('twelve point five zero tesco')).toBe('12.50 tesco');
    expect(normaliseSpokenAmount('three point four zero coffee')).toBe('3.40 coffee');
  });

  it('reads pence spoken after the pounds, as people actually say it', () => {
    // "twelve pounds fifty" is the ordinary British form and no digit parser
    // would catch it.
    expect(normaliseSpokenAmount('twelve pounds fifty tesco')).toBe('12.50 tesco');
    expect(normaliseSpokenAmount('twelve pounds fifty pence tesco')).toBe('12.50 tesco');
    expect(normaliseSpokenAmount('45 pounds 20 shell')).toBe('45.20 shell');
  });

  it('drops a bare currency word rather than leaving it in the note', () => {
    expect(normaliseSpokenAmount('forty five pounds fuel')).toBe('45 fuel');
    expect(normaliseSpokenAmount('sixty euros dinner')).toBe('60 dinner');
  });

  it('only takes the first number, so later ones stay as words', () => {
    // "table for two" must not overwrite the amount, and must not become "2".
    expect(normaliseSpokenAmount('forty pounds dinner table for two')).toBe(
      '40 dinner table for two'
    );
  });

  it('does not treat "and" between ordinary words as part of a number', () => {
    expect(normaliseSpokenAmount('twenty tesco and shell')).toBe('20 tesco and shell');
  });

  it('copes with the common misspelling dictation produces', () => {
    expect(normaliseSpokenAmount('fourty five fuel')).toBe('45 fuel');
  });

  it('leaves a sentence with no number untouched', () => {
    expect(normaliseSpokenAmount('tesco big shop')).toBe('tesco big shop');
  });
});

describe('dictation end to end', () => {
  const spoken = (text: string) =>
    parseEntryText(normaliseSpokenAmount(text), { now: NOW });

  it('understands a whole dictated entry', () => {
    const result = spoken('forty five pounds twenty fuel yesterday');
    expect(result.amount).toBe(45.2);
    expect(result.date).toBe('2026-09-12');
    expect(result.category?.category).toBe('mobility_transport_fuel');
  });

  it('understands the plainest possible version', () => {
    const result = spoken('twelve pounds fifty tesco');
    expect(result.amount).toBe(12.5);
    expect(result.category?.category).toBe('living_home_supermarket');
    expect(result.note).toBe('tesco');
  });

  it('understands a larger round amount', () => {
    const result = spoken('one thousand two hundred and fifty rent');
    expect(result.amount).toBe(1250);
    expect(result.category?.category).toBe('living_home_rent');
  });

  it('still works when the amount is dictated as digits', () => {
    // Dictation often produces digits by itself; both paths must agree.
    expect(spoken('9.99 netflix').amount).toBe(9.99);
    expect(spoken('nine pounds ninety nine netflix').amount).toBe(9.99);
  });
});
