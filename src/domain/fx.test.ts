import { describe, expect, it } from 'vitest';
import { dayOf, pickNearestRate } from './fx';

describe('dayOf', () => {
  it('reduces an ISO timestamp to a day', () => {
    expect(dayOf('2026-07-14T20:31:05.000Z')).toBe('2026-07-14');
    expect(dayOf('2026-07-14')).toBe('2026-07-14');
  });

  it('falls back to today rather than producing rubbish', () => {
    expect(dayOf('nonsense')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('pickNearestRate', () => {
  const rates = {
    '2026-07-10': 0.85,
    '2026-07-13': 0.86,
    '2026-07-17': 0.87
  };

  it('prefers an exact match', () => {
    expect(pickNearestRate(rates, '2026-07-13')).toEqual({ rate: 0.86, rateDate: '2026-07-13' });
  });

  it('falls back to the closest day either side', () => {
    // Saturday — the ECB publishes on business days only, so this is the
    // ordinary weekend case, not an edge case.
    expect(pickNearestRate(rates, '2026-07-14')).toEqual({ rate: 0.86, rateDate: '2026-07-13' });
    expect(pickNearestRate(rates, '2026-07-16')).toEqual({ rate: 0.87, rateDate: '2026-07-17' });
  });

  it('reaches far back when that is all there is', () => {
    expect(pickNearestRate(rates, '2027-01-01')).toEqual({ rate: 0.87, rateDate: '2026-07-17' });
  });

  it('is deterministic when two days are equally close', () => {
    const tied = { '2026-07-13': 0.86, '2026-07-15': 0.88 };
    expect(pickNearestRate(tied, '2026-07-14')).toEqual({ rate: 0.86, rateDate: '2026-07-13' });
  });

  it('returns null rather than inventing a rate', () => {
    expect(pickNearestRate(undefined, '2026-07-14')).toBeNull();
    expect(pickNearestRate({}, '2026-07-14')).toBeNull();
  });

  it('ignores unparseable days in the cache', () => {
    expect(pickNearestRate({ rubbish: 9, '2026-07-13': 0.86 }, '2026-07-14')).toEqual({
      rate: 0.86,
      rateDate: '2026-07-13'
    });
  });
});
