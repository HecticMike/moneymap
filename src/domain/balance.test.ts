import { describe, expect, it } from 'vitest';
import { monthlyBalance, summariseBalance } from './balance';
import type { CategoryId } from './categories';
import type { Entry } from './types';

/** 13 September 2026 — mid-month, so the current bucket is partial. */
const NOW = new Date(2026, 8, 13, 18, 0, 0);

let counter = 0;
const on = (
  year: number,
  month1to12: number,
  day: number,
  amount: number,
  category: CategoryId
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

describe('monthlyBalance', () => {
  it('returns the requested number of months, oldest first', () => {
    const months = monthlyBalance([], { now: NOW, months: 4 });
    expect(months).toHaveLength(4);
    expect(months.map((m) => m.label)).toEqual(['Jun', 'Jul', 'Aug', 'Sep']);
  });

  it('separates income from spend and nets them', () => {
    const entries = [
      on(2026, 8, 2, 2400, 'income_salary'),
      on(2026, 8, 5, 1250, 'living_home_rent'),
      on(2026, 8, 9, 150, 'living_home_supermarket')
    ];

    const august = monthlyBalance(entries, { now: NOW, months: 2 }).find((m) => m.label === 'Aug');
    expect(august!.income).toBe(2400);
    expect(august!.spend).toBe(1400);
    expect(august!.net).toBe(1000);
  });

  it('flags the current month as partial', () => {
    const months = monthlyBalance([], { now: NOW, months: 3 });
    expect(months.filter((m) => m.partial).map((m) => m.label)).toEqual(['Sep']);
  });

  it('does not flag a completed month as partial', () => {
    // Asked for on the last day of the month, nothing is still to come.
    const lastDay = new Date(2026, 8, 30, 23, 59, 59);
    const months = monthlyBalance([], { now: lastDay, months: 1 });
    expect(months[0]!.partial).toBe(false);
  });

  it('computes a savings rate, and refuses to when there was no income', () => {
    const entries = [
      on(2026, 8, 2, 2000, 'income_salary'),
      on(2026, 8, 5, 1500, 'living_home_rent'),
      on(2026, 7, 5, 100, 'living_home_supermarket')
    ];

    const months = monthlyBalance(entries, { now: NOW, months: 3 });
    expect(months.find((m) => m.label === 'Aug')!.savingsRate).toBeCloseTo(0.25, 5);
    // July had spending but no income — a rate against zero is meaningless.
    expect(months.find((m) => m.label === 'Jul')!.savingsRate).toBeNull();
  });

  it('reports a negative net when spending outruns income', () => {
    const entries = [
      on(2026, 8, 2, 1000, 'income_salary'),
      on(2026, 8, 5, 1600, 'living_home_rent')
    ];
    const august = monthlyBalance(entries, { now: NOW, months: 2 }).find((m) => m.label === 'Aug');
    expect(august!.net).toBe(-600);
    expect(august!.savingsRate).toBeCloseTo(-0.6, 5);
  });

  it('ignores entries older than the window', () => {
    const entries = [on(2025, 1, 5, 999, 'living_home_rent')];
    expect(monthlyBalance(entries, { now: NOW, months: 3 }).every((m) => m.spend === 0)).toBe(true);
  });

  it('does not let a future-dated entry inflate this month', () => {
    const entries = [on(2026, 9, 28, 500, 'living_home_supermarket')];
    const september = monthlyBalance(entries, { now: NOW, months: 1 })[0];
    expect(september!.spend).toBe(0);
  });

  it('ignores unreadable dates', () => {
    const broken = { ...on(2026, 9, 5, 100, 'living_home_rent'), date: 'nonsense' };
    expect(() => monthlyBalance([broken], { now: NOW })).not.toThrow();
    expect(monthlyBalance([broken], { now: NOW, months: 1 })[0]!.spend).toBe(0);
  });
});

describe('summariseBalance', () => {
  const steady = [
    ...[5, 6, 7, 8].flatMap((month) => [
      on(2026, month, 2, 2000, 'income_salary'),
      on(2026, month, 5, 1500, 'living_home_rent')
    ]),
    // September so far: income in, barely any spending yet.
    on(2026, 9, 2, 2000, 'income_salary')
  ];

  it('averages completed months only', () => {
    // The partial month shows +2000 so far, which would badly skew a mean that
    // included it — the same trap as comparing a part-month to whole months.
    const summary = summariseBalance(steady, { now: NOW, months: 6 });
    expect(summary.typicalNet).toBe(500);
    // May through August. April is inside the six-month window but predates
    // the first entry, so it is not data and must not be averaged in.
    expect(summary.completedMonths).toBe(4);
  });

  it('ignores months from before the household started logging', () => {
    // Asking for twelve months of history when only four exist must not
    // report the typical net as a third of what it really is.
    const twelve = summariseBalance(steady, { now: NOW, months: 12 });
    expect(twelve.typicalNet).toBe(500);
    expect(twelve.completedMonths).toBe(4);
  });

  it('exposes the current month separately', () => {
    const summary = summariseBalance(steady, { now: NOW, months: 6 });
    expect(summary.current!.label).toBe('Sep');
    expect(summary.current!.partial).toBe(true);
    expect(summary.current!.net).toBe(2000);
  });

  it('averages the savings rate over months that had income', () => {
    const summary = summariseBalance(steady, { now: NOW, months: 6 });
    expect(summary.typicalSavingsRate).toBeCloseTo(0.25, 5);
  });

  it('copes with an empty ledger', () => {
    const summary = summariseBalance([], { now: NOW, months: 3 });
    expect(summary.typicalNet).toBe(0);
    expect(summary.typicalSavingsRate).toBeNull();
    expect(summary.current!.net).toBe(0);
  });
});
