import { endOfDay, endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { isIncome } from './categories';
import { roundMoney } from './money';
import type { Entry } from './types';

/**
 * The balance side of the app: income against outgoings.
 *
 * Deliberately separate from `choices.ts` and `insights.ts`, which only ever
 * look at spending. The household's stated priority is understanding where
 * money goes, not running a budget — so this lives behind a setting, defaults
 * off, and exists so the balance view has somewhere to grow rather than
 * needing the app reshaped around it later.
 */

export interface MonthBalance {
  /** ISO timestamp of the first of the month, for stable sorting and keys. */
  month: string;
  label: string;
  income: number;
  spend: number;
  net: number;
  /**
   * Share of income not spent. Null when there was no income that month —
   * a savings rate against zero income is not a number worth showing.
   */
  savingsRate: number | null;
  /** True for the current month, which is only partly elapsed. */
  partial: boolean;
}

export interface BalanceOptions {
  now?: Date;
  /** How many months to return, including the current one. */
  months?: number;
}

/**
 * Income, spend and net for each of the last N months.
 *
 * The current month is returned like any other but flagged `partial`, because
 * charting thirteen days against twelve full months without saying so is the
 * same trap the month comparison exists to avoid.
 */
export const monthlyBalance = (
  entries: Entry[],
  options: BalanceOptions = {}
): MonthBalance[] => {
  const now = options.now ?? new Date();
  const months = options.months ?? 6;

  const buckets = new Map<string, { income: number; spend: number }>();
  const order: Array<{ key: string; start: Date }> = [];

  for (let back = months - 1; back >= 0; back -= 1) {
    const start = startOfMonth(subMonths(now, back));
    const key = start.toISOString();
    buckets.set(key, { income: 0, spend: 0 });
    order.push({ key, start });
  }

  const earliest = order[0]?.start.getTime() ?? 0;

  for (const entry of entries) {
    const when = new Date(entry.date).getTime();
    if (Number.isNaN(when) || when < earliest) continue;
    // Never count a future-dated entry into the current month's totals.
    if (when > endOfDay(now).getTime()) continue;

    const key = startOfMonth(new Date(when)).toISOString();
    const bucket = buckets.get(key);
    if (bucket == null) continue;

    if (isIncome(entry.category)) bucket.income += entry.baseAmount;
    else bucket.spend += entry.baseAmount;
  }

  const currentKey = startOfMonth(now).toISOString();

  return order.map(({ key, start }) => {
    const bucket = buckets.get(key) ?? { income: 0, spend: 0 };
    const income = roundMoney(bucket.income);
    const spend = roundMoney(bucket.spend);
    const net = roundMoney(income - spend);

    return {
      month: key,
      label: format(start, 'MMM'),
      income,
      spend,
      net,
      savingsRate: income > 0 ? net / income : null,
      partial: key === currentKey && endOfMonth(now).getTime() > endOfDay(now).getTime()
    };
  });
};

export interface BalanceSummary {
  months: MonthBalance[];
  /** The current month, always the last element of `months`. */
  current: MonthBalance | null;
  /** Mean net across completed months only — the partial one would drag it. */
  typicalNet: number | null;
  /** Mean savings rate across completed months that had income. */
  typicalSavingsRate: number | null;
  completedMonths: number;
}

export const summariseBalance = (
  entries: Entry[],
  options: BalanceOptions = {}
): BalanceSummary => {
  const months = monthlyBalance(entries, options);

  // Months entirely before the household started logging are not "a month
  // where they netted nothing" — they are months with no data, and averaging
  // them in drags every typical figure toward zero. Same trap as the insights
  // baseline, which only counts months the data actually reaches.
  const earliest = entries.reduce<number | null>((min, entry) => {
    const when = new Date(entry.date).getTime();
    if (Number.isNaN(when)) return min;
    return min == null || when < min ? when : min;
  }, null);

  const covered =
    earliest == null
      ? months
      : months.filter((month) => endOfMonth(new Date(month.month)).getTime() >= earliest);

  const completed = covered.filter((month) => !month.partial);
  const withIncome = completed.filter((month) => month.savingsRate != null);

  return {
    months,
    current: months[months.length - 1] ?? null,
    typicalNet:
      completed.length === 0
        ? null
        : roundMoney(completed.reduce((sum, month) => sum + month.net, 0) / completed.length),
    typicalSavingsRate:
      withIncome.length === 0
        ? null
        : withIncome.reduce((sum, month) => sum + (month.savingsRate ?? 0), 0) / withIncome.length,
    completedMonths: completed.length
  };
};
