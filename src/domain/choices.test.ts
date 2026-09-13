import { describe, expect, it } from 'vitest';
import { committedKeys, isCommittedEntry, reviewChoices, splitSpend } from './choices';
import { monthToDate, rangeWindow } from './insights';
import type { CategoryId } from './categories';
import type { Entry } from './types';

/** 13 September 2026 — a partial month, which the comparison has to respect. */
const NOW = new Date(2026, 8, 13, 18, 0, 0);

let counter = 0;
const on = (
  year: number,
  month1to12: number,
  day: number,
  amount: number,
  category: CategoryId,
  note = ''
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
    note,
    user: null,
    createdAt: date.toISOString(),
    updatedAt: date.toISOString(),
    source: 'form'
  };
};

/** Rent on the 1st, every month including this one — a real obligation. */
const rent = (months: number[]) => months.map((month) => on(2026, month, 1, 1250, 'living_home_rent'));

/** Netflix on the 5th, every month — also an obligation. */
const netflix = (months: number[]) =>
  months.map((month) => on(2026, month, 5, 9.99, 'leisure_lifestyle_subscriptions', 'Netflix'));

describe('committed detection', () => {
  it('recognises rent and subscriptions as obligations', () => {
    const entries = [...rent([6, 7, 8, 9]), ...netflix([6, 7, 8, 9])];
    const keys = committedKeys(entries, NOW);

    expect(isCommittedEntry(entries[0]!, keys)).toBe(true);
    expect(keys.size).toBe(2);
  });

  it('does not treat a regular night out as an obligation', () => {
    // Monthly, same amount, same day — genuinely regular, but nobody is
    // obliged to go to dinner, and counting it as committed would overstate
    // how little room the household has.
    const dinners = [6, 7, 8, 9].map((month) =>
      on(2026, month, 6, 30, 'leisure_lifestyle_eating_out', 'Dinner')
    );
    const keys = committedKeys(dinners, NOW);
    expect(keys.size).toBe(0);
  });

  it('drops an obligation that has plainly stopped', () => {
    // Cancelled in the spring; by September it should not still be counted.
    const gym = [1, 2, 3].map((month) => on(2026, month, 20, 40, 'personal_health_fitness', 'Gym'));
    expect(committedKeys(gym, NOW).size).toBe(0);
  });
});

describe('splitSpend', () => {
  it('separates obligations from choices', () => {
    const entries = [
      ...rent([6, 7, 8, 9]),
      ...netflix([6, 7, 8, 9]),
      on(2026, 9, 4, 60, 'living_home_supermarket', 'Tesco'),
      on(2026, 9, 6, 240, 'leisure_lifestyle_eating_out', 'Birthday dinner')
    ];

    const split = splitSpend(entries, monthToDate(NOW), committedKeys(entries, NOW));
    expect(split.committed).toBe(1259.99);
    expect(split.chosen).toBe(300);
    expect(split.total).toBe(1559.99);
  });

  it('counts everything as chosen when nothing is committed', () => {
    const entries = [on(2026, 9, 4, 60, 'living_home_supermarket', 'Tesco')];
    const split = splitSpend(entries, monthToDate(NOW), committedKeys(entries, NOW));
    expect(split.chosen).toBe(60);
    expect(split.committed).toBe(0);
  });

  it('excludes income from both sides', () => {
    const entries = [
      on(2026, 9, 2, 2400, 'income_salary', 'Payroll'),
      on(2026, 9, 4, 60, 'living_home_supermarket', 'Tesco')
    ];
    const split = splitSpend(entries, monthToDate(NOW), new Set());
    expect(split.total).toBe(60);
  });
});

describe('reviewChoices', () => {
  const household = [
    ...rent([4, 5, 6, 7, 8, 9]),
    ...netflix([4, 5, 6, 7, 8, 9]),
    // Ordinary groceries, steady each month in the first 13 days.
    ...[4, 5, 6, 7, 8, 9].map((month) => on(2026, month, 4, 60, 'living_home_supermarket', 'Tesco')),
    // Eating out: quiet until this month, then a blowout.
    ...[4, 5, 6, 7, 8].map((month) => on(2026, month, 6, 25, 'leisure_lifestyle_eating_out', 'Lunch')),
    on(2026, 9, 6, 300, 'leisure_lifestyle_eating_out', 'Birthday dinner')
  ];

  it('reports choices separately from obligations', () => {
    const review = reviewChoices(household, { now: NOW });
    expect(review.committed.current).toBe(1259.99);
    expect(review.chosen.current).toBe(360);
  });

  it('measures choices against the same days of previous months', () => {
    // Every prior month had £60 groceries + £25 lunch in its first 13 days.
    const review = reviewChoices(household, { now: NOW });
    expect(review.chosen.baseline).toBe(85);
    expect(review.chosen.deltaAbs).toBe(275);
  });

  it('holds obligations flat, which is the point of separating them', () => {
    // Rent and Netflix are identical every month, so the committed comparison
    // should show no movement at all — and therefore stop diluting the total.
    const review = reviewChoices(household, { now: NOW });
    expect(review.committed.deltaAbs).toBe(0);
    expect(review.committed.notable).toBe(false);
  });

  it('gives shares out of chosen spend, not out of everything', () => {
    const review = reviewChoices(household, { now: NOW });
    const eatingOut = review.lines.find((line) => line.category === 'leisure_lifestyle_eating_out');

    expect(eatingOut).toBeDefined();
    // 300 of 360 chosen = 83%. Out of total spend it would be a trivial 19%,
    // which is exactly the dilution this whole split exists to remove.
    expect(eatingOut!.share).toBeCloseTo(300 / 360, 3);
    expect(eatingOut!.amount).toBe(300);
  });

  it('shares across all lines add up to one', () => {
    const review = reviewChoices(household, { now: NOW });
    const total = review.lines.reduce((sum, line) => sum + line.share, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it('never lists an obligation among the choices', () => {
    const review = reviewChoices(household, { now: NOW });
    expect(review.lines.map((line) => line.category)).not.toContain('living_home_rent');
    expect(review.lines.map((line) => line.category)).not.toContain(
      'leisure_lifestyle_subscriptions'
    );
  });

  it('offers the lever only where the rise is worth acting on', () => {
    const review = reviewChoices(household, { now: NOW });
    const eatingOut = review.lines.find((line) => line.category === 'leisure_lifestyle_eating_out');
    const groceries = review.lines.find((line) => line.category === 'living_home_supermarket');

    expect(eatingOut!.couldFree).toBe(275);
    // Groceries are exactly on their usual level, so there is nothing to offer.
    expect(groceries!.couldFree).toBeNull();
  });

  it('ranks by what was actually spent', () => {
    const review = reviewChoices(household, { now: NOW });
    expect(review.lines[0]!.category).toBe('leisure_lifestyle_eating_out');
  });

  it('says so when there is too little history to compare', () => {
    const review = reviewChoices([on(2026, 9, 4, 60, 'living_home_supermarket')], { now: NOW });
    expect(review.insufficientHistory).toBe(true);
    expect(review.chosen.notable).toBe(false);
  });

  it('copes with an empty ledger', () => {
    const review = reviewChoices([], { now: NOW });
    expect(review.chosen.current).toBe(0);
    expect(review.lines).toEqual([]);
  });
});

describe('rangeWindow', () => {
  it('covers the requested number of months up to today', () => {
    const threeMonths = rangeWindow(NOW, '3m');
    // July, August, September.
    expect(threeMonths.start.getMonth()).toBe(6);
    expect(threeMonths.start.getDate()).toBe(1);
    expect(threeMonths.end.getMonth()).toBe(8);
  });

  it('treats one month as the current month so far', () => {
    const oneMonth = rangeWindow(NOW, '1m');
    expect(oneMonth.start.getMonth()).toBe(8);
    expect(oneMonth.start.getDate()).toBe(1);
  });

  it('reaches back a year', () => {
    const year = rangeWindow(NOW, '12m');
    expect(year.start.getFullYear()).toBe(2025);
    expect(year.start.getMonth()).toBe(9);
  });

  it('covers everything for "all"', () => {
    expect(rangeWindow(NOW, 'all').start.getTime()).toBe(0);
  });
});
