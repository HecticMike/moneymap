import { describe, expect, it } from 'vitest';
import { formatMoney, parseAmount, roundMoney, toBaseAmount } from './money';

describe('roundMoney', () => {
  it('rounds to two decimal places', () => {
    expect(roundMoney(12.344)).toBe(12.34);
    expect(roundMoney(12.346)).toBe(12.35);
    expect(roundMoney(12)).toBe(12);
  });

  it('rounds half up despite float representation error', () => {
    // 1.005 is really 1.00499999999999989, so a naive Math.round gives 1.00.
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(8.345)).toBe(8.35);
  });

  it('rounds negatives away from zero symmetrically', () => {
    expect(roundMoney(-1.005)).toBe(-1.01);
    expect(roundMoney(-12.344)).toBe(-12.34);
  });

  it('never returns NaN or Infinity', () => {
    expect(roundMoney(Number.NaN)).toBe(0);
    expect(roundMoney(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('keeps a long sum penny-accurate', () => {
    const total = Array.from({ length: 5000 }, () => 0.07).reduce((sum, v) => sum + v, 0);
    expect(roundMoney(total)).toBe(350);
  });
});

describe('toBaseAmount', () => {
  it('is identity at rate 1', () => {
    expect(toBaseAmount(42.5, 1)).toBe(42.5);
  });

  it('converts and rounds once', () => {
    expect(toBaseAmount(50, 0.8534)).toBe(42.67);
    expect(toBaseAmount(19.99, 0.8534)).toBe(17.06);
  });
});

describe('parseAmount', () => {
  it('reads plain decimals', () => {
    expect(parseAmount('12.50')).toBe(12.5);
    expect(parseAmount('12')).toBe(12);
    expect(parseAmount('0.5')).toBe(0.5);
  });

  it('reads a comma as a decimal separator', () => {
    // Typing on a Portuguese keyboard, or just habit.
    expect(parseAmount('12,50')).toBe(12.5);
    expect(parseAmount('0,99')).toBe(0.99);
  });

  it('strips currency symbols and whitespace', () => {
    expect(parseAmount('£12.50')).toBe(12.5);
    expect(parseAmount('€ 45,20')).toBe(45.2);
    expect(parseAmount('  7.99  ')).toBe(7.99);
  });

  it('reads both thousands conventions', () => {
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('1.234,56')).toBe(1234.56);
  });

  it('treats a lone separator followed by three digits as grouping', () => {
    expect(parseAmount('1,234')).toBe(1234);
    expect(parseAmount('1.234')).toBe(1234);
  });

  it('handles negatives', () => {
    expect(parseAmount('-12.50')).toBe(-12.5);
    expect(parseAmount('-£8')).toBe(-8);
  });

  it('returns null for anything that is not an amount', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
    expect(parseAmount('tesco')).toBeNull();
    expect(parseAmount('-')).toBeNull();
    expect(parseAmount('£')).toBeNull();
  });

  it('pulls the amount out of free text (used by text capture)', () => {
    expect(parseAmount('12.50 tesco')).toBe(12.5);
    expect(parseAmount('coffee 3,40')).toBe(3.4);
  });
});

describe('formatMoney', () => {
  it('formats in the requested currency', () => {
    expect(formatMoney(12.5, 'GBP')).toContain('12.50');
    expect(formatMoney(12.5, 'EUR')).toContain('12.50');
  });

  it('always shows two decimal places', () => {
    expect(formatMoney(12, 'GBP')).toContain('12.00');
  });

  it('defaults to the base currency', () => {
    expect(formatMoney(5)).toBe(formatMoney(5, 'GBP'));
  });
});
