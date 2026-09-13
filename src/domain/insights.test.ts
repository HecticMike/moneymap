import { describe, expect, it } from 'vitest';
import { comparableWindows, compare, monthToDate, reviewMonth, spendIn } from './insights';
import type { CategoryId } from './categories';
import type { Entry } from './types';

/** 13 September 2026 — a partial month, which is the whole point. */
const NOW = new Date(2026, 8, 13, 18, 0, 0);

let counter = 0;
const on = (
  year: number,
  month1to12: number,
  day: number,
  amount: number,
  category: CategoryId = 'living_home_supermarket'
): Entry => {
  const date = new Date(year, month1to12 - 1, day, 12, 0, 0);
  return {
    id: `e${counter++}`,
    amount,
    currency: 'GBP',
    rateToBase: 1,
    rateDate: null,
    baseAmount: amount,
    category,
    date: date.toISOString(),
    note: '',
    user: null,
    createdAt: date.toISOString(),
    updatedAt: date.toISOString(),
    source: 'form'
  };
};

describe('windows', () => {
  it('runs the current month from the 1st through today', () => {
    const window = monthToDate(NOW);
    expect(window.start.getDate()).toBe(1);
    expect(window.start.getMonth()).toBe(8);
    expect(window.throughDayOfMonth).toBe(13);
  });

  it('takes the same slice out of each preceding month', () => {
    const windows = comparableWindows(NOW, 3);
    expect(windows).toHaveLength(3);
    expect(windows.map((w) => w.start.getMonth())).toEqual([7, 6, 5]);
    expect(windows.every((w) => w.throughDayOfMonth === 13)).toBe(true);
  });

  it('clamps to a short month instead of spilling into the next one', () => {
    // 31 March compared against February: the window must end on the 28th,
    // not run on into March and double-count.
    const endOfMarch = new Date(2026, 2, 31, 12, 0, 0);
    const [february] = comparableWindows(endOfMarch, 1);
    expect(february!.throughDayOfMonth).toBe(28);
    expect(february!.end.getMonth()).toBe(1);
  });
});

describe('the partial-month trap', () => {
  it('compares like for like instead of part-month against whole months', () => {
    // £100 so far in September. August had £100 in its first 13 days and
    // another £200 later on. A naive whole-month comparison would report
    // spending down 67%; the honest answer is that it is flat.
    const entries = [on(2026, 9, 5, 100), on(2026, 8, 5, 100), on(2026, 8, 20, 200)];

    const review = reviewMonth(entries, { now: NOW, lookback: 1 });
    expect(review.spend.current).toBe(100);
    expect(review.spend.baseline).toBe(100);
    expect(review.spend.deltaAbs).toBe(0);
  });

  it('reports the window it used, so the UI can label it', () => {
    const review = reviewMonth([on(2026, 9, 5, 100)], { now: NOW, lookback: 3 });
    expect(review.window.throughDayOfMonth).toBe(13);
    expect(review.priorWindows.every((w) => w.throughDayOfMonth === 13)).toBe(true);
  });
});

describe('spendIn', () => {
  it('excludes income from spend', () => {
    const entries = [on(2026, 9, 5, 100), on(2026, 9, 6, 2000, 'income_salary')];
    expect(spendIn(entries, monthToDate(NOW))).toBe(100);
  });

  it('ignores entries outside the window', () => {
    expect(spendIn([on(2026, 8, 5, 100)], monthToDate(NOW))).toBe(0);
  });

  it('ignores unreadable dates rather than counting them', () => {
    const broken = { ...on(2026, 9, 5, 100), date: 'nonsense' };
    expect(spendIn([broken], monthToDate(NOW))).toBe(0);
  });
});

describe('compare', () => {
  it('averages the prior windows', () => {
    expect(compare(150, [100, 200]).baseline).toBe(150);
    expect(compare(150, [100, 200]).deltaAbs).toBe(0);
  });

  it('returns a null percentage rather than infinity when the baseline is zero', () => {
    // "Up ∞%" is not something to render at anyone.
    const result = compare(50, [0, 0]);
    expect(result.deltaPct).toBeNull();
  });

  it('will not flag a large percentage on a trivial amount', () => {
    // £2 to £8 is +300%, and completely meaningless. This guard is what keeps
    // the whole feature believable.
    const trivial = compare(8, [2, 2]);
    expect(trivial.deltaPct).toBeCloseTo(3);
    expect(trivial.notable).toBe(false);
  });

  it('will not flag a large amount that is a small proportional move', () => {
    expect(compare(1020, [1000, 1000]).notable).toBe(false);
  });

  it('flags a move that is big both ways', () => {
    expect(compare(300, [100, 100]).notable).toBe(true);
    expect(compare(50, [200, 200]).notable).toBe(true);
  });

  it('will not flag anything without enough history', () => {
    expect(compare(300, [100]).notable).toBe(false);
    expect(compare(300, []).notable).toBe(false);
  });
});

describe('reviewMonth', () => {
  it('only counts months the data actually reaches back to', () => {
    // Two months of history against a six-month lookback. Averaging over six
    // would divide by four empty months and report spending as tripled.
    const entries = [on(2026, 9, 5, 300), on(2026, 8, 5, 300)];
    const review = reviewMonth(entries, { now: NOW, lookback: 6 });

    expect(review.priorWindows).toHaveLength(1);
    expect(review.spend.baseline).toBe(300);
    expect(review.spend.deltaAbs).toBe(0);
  });

  it('says so when there is too little history to compare', () => {
    const review = reviewMonth([on(2026, 9, 5, 100)], { now: NOW, lookback: 6 });
    expect(review.insufficientHistory).toBe(true);
    expect(review.spend.notable).toBe(false);
  });

  it('ranks groups by how much they moved', () => {
    const entries = [
      on(2026, 9, 5, 400, 'leisure_lifestyle_eating_out'),
      on(2026, 8, 5, 100, 'leisure_lifestyle_eating_out'),
      on(2026, 7, 5, 100, 'leisure_lifestyle_eating_out'),
      on(2026, 9, 6, 105, 'living_home_supermarket'),
      on(2026, 8, 6, 100, 'living_home_supermarket'),
      on(2026, 7, 6, 100, 'living_home_supermarket')
    ];

    const review = reviewMonth(entries, { now: NOW, lookback: 6 });
    expect(review.byGroup[0]!.key).toBe('leisure_lifestyle');
    expect(review.byGroup[0]!.comparison.notable).toBe(true);
    expect(review.byGroup[1]!.comparison.notable).toBe(false);
  });

  it('tracks income separately from spend', () => {
    const entries = [
      on(2026, 9, 2, 2000, 'income_salary'),
      on(2026, 8, 2, 2000, 'income_salary'),
      on(2026, 9, 5, 100)
    ];
    const review = reviewMonth(entries, { now: NOW, lookback: 2 });
    expect(review.income.current).toBe(2000);
    expect(review.spend.current).toBe(100);
  });

  it('copes with an empty ledger', () => {
    const review = reviewMonth([], { now: NOW });
    expect(review.spend.current).toBe(0);
    expect(review.byGroup).toEqual([]);
    expect(review.insufficientHistory).toBe(true);
  });
});
