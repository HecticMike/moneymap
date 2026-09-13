import { CATEGORY_META, isIncome, type CategoryId } from './categories';
import { compare, comparableWindows, monthToDate, type Comparison, type DateWindow } from './insights';
import { roundMoney } from './money';
import { committedSpend, seriesKey } from './recurring';
import type { Entry } from './types';

/**
 * Separating what the household *chose* to spend from what it *owed*.
 *
 * The reason this exists: a headline of "£1,830 this month" is mostly rent, and
 * rent was going out whatever anyone did. Reporting it as the number invites
 * the question "where does the money go?", whose honest answer is "rent,
 * forever" — true, unhelpful, and unchanged month to month.
 *
 * Reporting choices instead invites "where did the money I could actually
 * influence go?", which has a different answer every month and is the only one
 * anybody can act on. Every proportion here is a share of that, so Eating Out
 * reads as a share of what was decided rather than a share of everything.
 */

/**
 * Which entries belong to a standing obligation.
 *
 * Derived from the *actual entries*, not from modelled monthly figures: an
 * entry counts as committed only if it matches a detected, still-active,
 * committed series. Prorating a modelled commitment would report rent as
 * partly paid on the 3rd of the month, which is not what happened.
 */
export const committedKeys = (entries: Entry[], now?: Date): Set<string> => {
  const detected = committedSpend(entries, now == null ? {} : { now });
  return new Set(detected.committed.map((series) => series.key));
};

export const isCommittedEntry = (entry: Entry, keys: Set<string>): boolean =>
  keys.has(seriesKey(entry));

export interface SpendSplit {
  chosen: number;
  committed: number;
  total: number;
}

const inWindow = (entry: Entry, window: DateWindow): boolean => {
  const when = new Date(entry.date).getTime();
  if (Number.isNaN(when)) return false;
  return when >= window.start.getTime() && when <= window.end.getTime();
};

export const splitSpend = (
  entries: Entry[],
  window: DateWindow,
  keys: Set<string>,
  filter?: (entry: Entry) => boolean
): SpendSplit => {
  let chosen = 0;
  let committed = 0;

  for (const entry of entries) {
    if (isIncome(entry.category)) continue;
    if (!inWindow(entry, window)) continue;
    if (filter != null && !filter(entry)) continue;

    if (isCommittedEntry(entry, keys)) committed += entry.baseAmount;
    else chosen += entry.baseAmount;
  }

  return {
    chosen: roundMoney(chosen),
    committed: roundMoney(committed),
    total: roundMoney(chosen + committed)
  };
};

export interface ChoiceLine {
  category: CategoryId;
  label: string;
  color: string;
  amount: number;
  /** Share of *chosen* spend, not of everything. */
  share: number;
  comparison: Comparison;
  /**
   * What returning to the usual level would free up this month. Only present
   * when the category is meaningfully above its baseline — the same number as
   * the delta, framed as a lever rather than a scolding.
   */
  couldFree: number | null;
}

export interface ChoiceReview {
  window: DateWindow;
  priorWindows: DateWindow[];
  chosen: Comparison;
  committed: Comparison;
  lines: ChoiceLine[];
  insufficientHistory: boolean;
}

export interface ChoiceOptions {
  now?: Date;
  lookback?: number;
}

/**
 * The month so far, split into choices and obligations, with every category
 * measured against the same slice of preceding months.
 */
export const reviewChoices = (entries: Entry[], options: ChoiceOptions = {}): ChoiceReview => {
  const now = options.now ?? new Date();
  const lookback = options.lookback ?? 6;

  const keys = committedKeys(entries, now);
  const window = monthToDate(now);

  const earliest = entries.reduce<number | null>((min, entry) => {
    const when = new Date(entry.date).getTime();
    if (Number.isNaN(when)) return min;
    return min == null || when < min ? when : min;
  }, null);

  // Only months the data actually reaches. Averaging over six when two exist
  // divides by four empty months and reports spending as tripled.
  const priorWindows =
    earliest == null
      ? []
      : comparableWindows(now, lookback).filter((prior) => prior.end.getTime() >= earliest);

  const current = splitSpend(entries, window, keys);
  const priors = priorWindows.map((prior) => splitSpend(entries, prior, keys));

  const chosenCategories = new Set<CategoryId>();
  for (const entry of entries) {
    if (isIncome(entry.category)) continue;
    if (isCommittedEntry(entry, keys)) continue;
    chosenCategories.add(entry.category);
  }

  const lines: ChoiceLine[] = [...chosenCategories]
    .map((category) => {
      const amount = splitSpend(entries, window, keys, (entry) => entry.category === category).chosen;
      const comparison = compare(
        amount,
        priorWindows.map(
          (prior) => splitSpend(entries, prior, keys, (entry) => entry.category === category).chosen
        )
      );

      return {
        category,
        label: CATEGORY_META[category].label,
        color: CATEGORY_META[category].color,
        amount,
        share: current.chosen > 0 ? amount / current.chosen : 0,
        comparison,
        couldFree: comparison.notable && comparison.deltaAbs > 0 ? comparison.deltaAbs : null
      };
    })
    .filter((line) => line.amount > 0 || line.comparison.notable)
    .sort((a, b) => b.amount - a.amount);

  return {
    window,
    priorWindows,
    chosen: compare(
      current.chosen,
      priors.map((prior) => prior.chosen)
    ),
    committed: compare(
      current.committed,
      priors.map((prior) => prior.committed)
    ),
    lines,
    insufficientHistory: priorWindows.length < 2
  };
};
