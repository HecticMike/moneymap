import { describe, expect, it } from 'vitest';
import { committedSpend, detectRecurring, median, seriesKey } from './recurring';
import type { CategoryId } from './categories';
import type { Entry } from './types';

const NOW = new Date(2026, 8, 13, 12, 0, 0);

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

/** A tidy monthly charge on the same day each month. */
const monthly = (
  months: number[],
  amount: number,
  category: CategoryId,
  note: string,
  day = 5
): Entry[] => months.map((month) => on(2026, month, day, amount, category, note));

describe('median', () => {
  it('handles odd and even counts', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe('seriesKey', () => {
  it('keeps two subscriptions in the same category apart', () => {
    const netflix = on(2026, 9, 5, 9.99, 'leisure_lifestyle_subscriptions', 'Netflix');
    const spotify = on(2026, 9, 5, 11.99, 'leisure_lifestyle_subscriptions', 'Spotify');
    expect(seriesKey(netflix)).not.toBe(seriesKey(spotify));
  });

  it('groups on the category alone when there is no note', () => {
    const rent = on(2026, 9, 1, 1250, 'living_home_rent');
    expect(seriesKey(rent)).toBe('living_home_rent');
  });
});

describe('detectRecurring', () => {
  it('finds a monthly subscription', () => {
    const series = detectRecurring(
      monthly([6, 7, 8, 9], 9.99, 'leisure_lifestyle_subscriptions', 'Netflix'),
      { now: NOW }
    );

    expect(series).toHaveLength(1);
    expect(series[0]!.cadence).toBe('monthly');
    expect(series[0]!.typicalAmount).toBe(9.99);
    expect(series[0]!.monthlyEquivalent).toBe(9.99);
    expect(series[0]!.occurrences).toBe(4);
    expect(series[0]!.active).toBe(true);
    expect(series[0]!.confidence).toBe('high');
  });

  it('does not call two occurrences a pattern', () => {
    const series = detectRecurring(
      monthly([8, 9], 9.99, 'leisure_lifestyle_subscriptions', 'Netflix'),
      { now: NOW }
    );
    expect(series).toHaveLength(0);
  });

  it('ignores irregular spacing', () => {
    // Groceries: same category and note, but bought whenever. Not a schedule.
    const entries = [
      on(2026, 9, 2, 50, 'living_home_supermarket', 'Tesco'),
      on(2026, 9, 3, 50, 'living_home_supermarket', 'Tesco'),
      on(2026, 8, 20, 50, 'living_home_supermarket', 'Tesco'),
      on(2026, 6, 1, 50, 'living_home_supermarket', 'Tesco')
    ];
    expect(detectRecurring(entries, { now: NOW })).toHaveLength(0);
  });

  it('ignores a series whose amount jumps around', () => {
    // Monthly timing, wildly different amounts — a habit, not a subscription.
    const entries = [
      on(2026, 6, 5, 20, 'leisure_lifestyle_eating_out', 'Dinner'),
      on(2026, 7, 5, 150, 'leisure_lifestyle_eating_out', 'Dinner'),
      on(2026, 8, 5, 45, 'leisure_lifestyle_eating_out', 'Dinner'),
      on(2026, 9, 5, 200, 'leisure_lifestyle_eating_out', 'Dinner')
    ];
    expect(detectRecurring(entries, { now: NOW })).toHaveLength(0);
  });

  it('tolerates the small wobble a real bill has', () => {
    // Utilities never bill the same amount or the same day twice.
    const entries = [
      on(2026, 6, 3, 82, 'living_home_utilities', 'Electric'),
      on(2026, 7, 5, 88, 'living_home_utilities', 'Electric'),
      on(2026, 8, 4, 85, 'living_home_utilities', 'Electric'),
      on(2026, 9, 6, 90, 'living_home_utilities', 'Electric')
    ];
    const series = detectRecurring(entries, { now: NOW });
    expect(series).toHaveLength(1);
    expect(series[0]!.cadence).toBe('monthly');
  });

  it('separates two subscriptions sharing a category', () => {
    const entries = [
      ...monthly([6, 7, 8, 9], 9.99, 'leisure_lifestyle_subscriptions', 'Netflix'),
      ...monthly([6, 7, 8, 9], 11.99, 'leisure_lifestyle_subscriptions', 'Spotify', 12)
    ];
    const series = detectRecurring(entries, { now: NOW });
    expect(series).toHaveLength(2);
    // Numeric comparator required — a bare .sort() compares as strings and
    // puts "11.99" before "9.99".
    expect(series.map((s) => s.typicalAmount).sort((a, b) => a - b)).toEqual([9.99, 11.99]);
  });

  it('marks a series lapsed once it is well overdue', () => {
    // Monthly, last seen in March. By September it is plainly cancelled.
    const series = detectRecurring(
      monthly([1, 2, 3], 9.99, 'leisure_lifestyle_subscriptions', 'Netflix'),
      { now: NOW }
    );
    expect(series[0]!.active).toBe(false);
  });

  it('recognises other cadences and normalises them to a monthly figure', () => {
    const weekly = detectRecurring(
      [
        on(2026, 9, 1, 20, 'personal_health_fitness', 'Class'),
        on(2026, 9, 8, 20, 'personal_health_fitness', 'Class'),
        on(2026, 8, 25, 20, 'personal_health_fitness', 'Class'),
        on(2026, 8, 18, 20, 'personal_health_fitness', 'Class')
      ],
      { now: NOW }
    );
    expect(weekly[0]!.cadence).toBe('weekly');
    expect(weekly[0]!.monthlyEquivalent).toBeCloseTo(86.97, 1);

    const quarterly = detectRecurring(
      [
        on(2026, 3, 10, 300, 'mobility_transport_car_insurance', 'Premium'),
        on(2026, 6, 10, 300, 'mobility_transport_car_insurance', 'Premium'),
        on(2026, 9, 10, 300, 'mobility_transport_car_insurance', 'Premium')
      ],
      { now: NOW }
    );
    expect(quarterly[0]!.cadence).toBe('quarterly');
    expect(quarterly[0]!.monthlyEquivalent).toBe(100);
  });

  it('ignores income', () => {
    const salary = monthly([6, 7, 8, 9], 2400, 'income_salary', 'Payroll');
    expect(detectRecurring(salary, { now: NOW })).toHaveLength(0);
  });

  it('does not treat a split payment on one day as a schedule', () => {
    const sameDay = [
      on(2026, 9, 5, 50, 'living_home_home_garden', 'Ikea'),
      on(2026, 9, 5, 50, 'living_home_home_garden', 'Ikea'),
      on(2026, 9, 5, 50, 'living_home_home_garden', 'Ikea')
    ];
    expect(detectRecurring(sameDay, { now: NOW })).toHaveLength(0);
  });

  it('never throws on damaged data', () => {
    const broken = { ...on(2026, 9, 5, 10, 'other', 'x'), date: 'nonsense' };
    expect(() => detectRecurring([broken], { now: NOW })).not.toThrow();
    expect(() => detectRecurring([], { now: NOW })).not.toThrow();
  });
});

describe('committedSpend', () => {
  it('totals only what is still running', () => {
    const entries = [
      ...monthly([6, 7, 8, 9], 9.99, 'leisure_lifestyle_subscriptions', 'Netflix'),
      ...monthly([6, 7, 8, 9], 1250, 'living_home_rent', '', 1),
      // Cancelled back in the spring — must not count towards the total.
      ...monthly([1, 2, 3], 40, 'personal_health_fitness', 'Gym', 20)
    ];

    const committed = committedSpend(entries, { now: NOW });
    expect(committed.committedTotal).toBe(1259.99);
    expect(committed.committed).toHaveLength(2);
    expect(committed.lapsed).toHaveLength(1);
    expect(committed.lapsed[0]!.label).toContain('Gym');
  });

  it('keeps regular habits out of the committed figure', () => {
    // A £30 dinner on the 19th of every month is genuinely regular, and worth
    // surfacing — but nobody is contractually obliged to go. Counting it as
    // committed overstates how locked in the household is, which is the
    // opposite of useful.
    const entries = [
      ...monthly([6, 7, 8, 9], 1250, 'living_home_rent', '', 1),
      ...monthly([6, 7, 8, 9], 30, 'leisure_lifestyle_eating_out', 'Dinner', 19)
    ];

    const result = committedSpend(entries, { now: NOW });
    expect(result.committedTotal).toBe(1250);
    expect(result.habitualTotal).toBe(30);
    expect(result.monthlyTotal).toBe(1280);
    expect(result.committed.map((s) => s.category)).toEqual(['living_home_rent']);
    expect(result.habitual.map((s) => s.category)).toEqual(['leisure_lifestyle_eating_out']);
  });

  it('treats bills, insurance and subscriptions as committed', () => {
    const entries = [
      ...monthly([6, 7, 8, 9], 85, 'living_home_utilities', 'Electric'),
      ...monthly([6, 7, 8, 9], 9.99, 'leisure_lifestyle_subscriptions', 'Netflix', 12),
      ...monthly([6, 7, 8, 9], 60, 'mobility_transport_fuel', 'Shell', 20)
    ];

    const result = committedSpend(entries, { now: NOW });
    expect(result.committed.map((s) => s.category).sort()).toEqual([
      'leisure_lifestyle_subscriptions',
      'living_home_utilities'
    ]);
    expect(result.habitual.map((s) => s.category)).toEqual(['mobility_transport_fuel']);
  });

  it('is zero with nothing to find', () => {
    const empty = committedSpend([], { now: NOW });
    expect(empty.committedTotal).toBe(0);
    expect(empty.habitualTotal).toBe(0);
  });
});
