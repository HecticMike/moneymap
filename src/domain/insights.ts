import { endOfDay, endOfMonth, startOfMonth, subMonths } from 'date-fns';
import { GROUP_META, groupOf, isIncome, type CategoryId, type GroupId } from './categories';
import { roundMoney } from './money';
import type { Entry } from './types';

/**
 * "Is this month unusual?"
 *
 * The trap this file exists to avoid: comparing 13 days of September against
 * whole months of July and August, and reporting that spending has collapsed.
 * Every comparison here is like-for-like — the same slice of the month, in each
 * month — and the window it used is returned so the UI can label it honestly.
 */

export interface DateWindow {
  start: Date;
  end: Date;
  /** Day of the month the window runs up to, inclusive. */
  throughDayOfMonth: number;
}

/** The current month so far, from the 1st through the end of today. */
export const monthToDate = (now: Date): DateWindow => ({
  start: startOfMonth(now),
  end: endOfDay(now),
  throughDayOfMonth: now.getDate()
});

/**
 * The same slice of each of the preceding `count` months.
 *
 * Short months are clamped to their own end rather than spilling forward, so
 * comparing the 1st–31st against February yields the whole of February instead
 * of leaking into March.
 */
export const comparableWindows = (now: Date, count: number): DateWindow[] => {
  const throughDay = now.getDate();
  const windows: DateWindow[] = [];

  for (let back = 1; back <= count; back += 1) {
    const month = subMonths(now, back);
    const start = startOfMonth(month);
    const monthEnd = endOfMonth(month);

    const wanted = new Date(start);
    wanted.setDate(throughDay);
    const end = endOfDay(wanted > monthEnd ? monthEnd : wanted);

    windows.push({
      start,
      end,
      throughDayOfMonth: Math.min(throughDay, monthEnd.getDate())
    });
  }

  return windows;
};

const inWindow = (entry: Entry, window: DateWindow): boolean => {
  const when = new Date(entry.date).getTime();
  if (Number.isNaN(when)) return false;
  return when >= window.start.getTime() && when <= window.end.getTime();
};

/** Total expense spend (in base currency) inside a window. Income is excluded. */
export const spendIn = (
  entries: Entry[],
  window: DateWindow,
  filter?: (entry: Entry) => boolean
): number => {
  let total = 0;
  for (const entry of entries) {
    if (isIncome(entry.category)) continue;
    if (!inWindow(entry, window)) continue;
    if (filter != null && !filter(entry)) continue;
    total += entry.baseAmount;
  }
  return roundMoney(total);
};

export const incomeIn = (entries: Entry[], window: DateWindow): number => {
  let total = 0;
  for (const entry of entries) {
    if (!isIncome(entry.category)) continue;
    if (!inWindow(entry, window)) continue;
    total += entry.baseAmount;
  }
  return roundMoney(total);
};

export interface Comparison {
  current: number;
  /** Mean of the comparable windows that actually contained data-bearing months. */
  baseline: number;
  deltaAbs: number;
  /** null when the baseline is zero — "up ∞%" is not a useful thing to render. */
  deltaPct: number | null;
  /** How many prior windows contributed. */
  samples: number;
  /**
   * Whether this movement is worth drawing attention to. Requires enough
   * history, a large enough proportional move, *and* a large enough absolute
   * one — otherwise "Supplements up 300%" fires on a £2 change and the whole
   * feature stops being believable.
   */
  notable: boolean;
}

/** Below this, a percentage swing is noise dressed up as a finding. */
const MATERIAL_ABS = 15;
const MATERIAL_PCT = 0.2;
const MIN_SAMPLES = 2;

export const compare = (current: number, priors: number[]): Comparison => {
  const samples = priors.length;
  const baseline =
    samples === 0 ? 0 : roundMoney(priors.reduce((sum, value) => sum + value, 0) / samples);

  const deltaAbs = roundMoney(current - baseline);
  const deltaPct = baseline === 0 ? null : deltaAbs / baseline;

  const notable =
    samples >= MIN_SAMPLES &&
    Math.abs(deltaAbs) >= MATERIAL_ABS &&
    (deltaPct == null || Math.abs(deltaPct) >= MATERIAL_PCT);

  return { current, baseline, deltaAbs, deltaPct, samples, notable };
};

export interface MoverBreakdown<K extends string> {
  key: K;
  label: string;
  color: string;
  comparison: Comparison;
}

export interface MonthReview {
  window: DateWindow;
  priorWindows: DateWindow[];
  spend: Comparison;
  income: Comparison;
  byGroup: MoverBreakdown<GroupId>[];
  byCategory: MoverBreakdown<CategoryId>[];
  /** True when there is too little history for any comparison to mean anything. */
  insufficientHistory: boolean;
}

export interface ReviewOptions {
  now?: Date;
  /** How many preceding months form the baseline. */
  lookback?: number;
}

/**
 * Compare the month so far against the same stretch of preceding months.
 *
 * Only months that actually contain entries count towards the baseline —
 * otherwise importing six months of history and then comparing against twelve
 * silently halves every baseline and reports spending as doubled.
 */
export const reviewMonth = (entries: Entry[], options: ReviewOptions = {}): MonthReview => {
  const now = options.now ?? new Date();
  const lookback = options.lookback ?? 6;

  const window = monthToDate(now);
  const allPriors = comparableWindows(now, lookback);

  const earliest = entries.reduce<number | null>((min, entry) => {
    const when = new Date(entry.date).getTime();
    if (Number.isNaN(when)) return min;
    return min == null || when < min ? when : min;
  }, null);

  const priorWindows =
    earliest == null
      ? []
      : allPriors.filter((prior) => prior.end.getTime() >= earliest);

  const groupsSeen = new Set<GroupId>();
  const categoriesSeen = new Set<CategoryId>();
  for (const entry of entries) {
    if (isIncome(entry.category)) continue;
    groupsSeen.add(groupOf(entry.category));
    categoriesSeen.add(entry.category);
  }

  const byGroup = [...groupsSeen]
    .map((group) => ({
      key: group,
      label: GROUP_META[group].label,
      color: GROUP_META[group].color,
      comparison: compare(
        spendIn(entries, window, (entry) => groupOf(entry.category) === group),
        priorWindows.map((prior) =>
          spendIn(entries, prior, (entry) => groupOf(entry.category) === group)
        )
      )
    }))
    .sort((a, b) => Math.abs(b.comparison.deltaAbs) - Math.abs(a.comparison.deltaAbs));

  const byCategory = [...categoriesSeen]
    .map((category) => ({
      key: category,
      label: '',
      color: '',
      comparison: compare(
        spendIn(entries, window, (entry) => entry.category === category),
        priorWindows.map((prior) => spendIn(entries, prior, (entry) => entry.category === category))
      )
    }))
    .sort((a, b) => Math.abs(b.comparison.deltaAbs) - Math.abs(a.comparison.deltaAbs));

  return {
    window,
    priorWindows,
    spend: compare(
      spendIn(entries, window),
      priorWindows.map((prior) => spendIn(entries, prior))
    ),
    income: compare(
      incomeIn(entries, window),
      priorWindows.map((prior) => incomeIn(entries, prior))
    ),
    byGroup,
    byCategory,
    insufficientHistory: priorWindows.length < MIN_SAMPLES
  };
};
