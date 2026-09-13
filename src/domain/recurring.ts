import { CATEGORY_META, isIncome, type CategoryId } from './categories';
import { roundMoney } from './money';
import { tokenise } from './suggestions';
import type { Entry } from './types';

/**
 * Telling committed spending apart from discretionary spending.
 *
 * The point is the number at the end: how much leaves the account every month
 * without anyone deciding anything. That figure is only useful if it is
 * trustworthy, so this errs heavily towards missing a real subscription rather
 * than inventing one — three occurrences minimum, regular spacing, and
 * consistent amounts, all required.
 */

export type Cadence = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'annual';

interface CadenceBand {
  cadence: Cadence;
  min: number;
  max: number;
  perMonth: number;
}

/** Generous bands: a "monthly" bill lands anywhere from 26 to 35 days apart. */
const CADENCE_BANDS: CadenceBand[] = [
  { cadence: 'weekly', min: 6, max: 8, perMonth: 30.44 / 7 },
  { cadence: 'fortnightly', min: 12, max: 16, perMonth: 30.44 / 14 },
  { cadence: 'monthly', min: 26, max: 35, perMonth: 1 },
  { cadence: 'quarterly', min: 82, max: 98, perMonth: 1 / 3 },
  { cadence: 'annual', min: 350, max: 380, perMonth: 1 / 12 }
];

const DAY_MS = 24 * 60 * 60 * 1000;

export const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

/** Spread relative to the average. Used for both spacing and amount stability. */
const coefficientOfVariation = (values: number[]): number => {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return 0;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / Math.abs(mean);
};

/**
 * What makes two entries "the same thing recurring".
 *
 * Category plus the first meaningful word of the note. Netflix and Spotify are
 * both Subscriptions but must not merge into one phantom series; rent entries
 * with no note at all group on the category alone.
 */
export const seriesKey = (entry: Entry): string => {
  const token = tokenise(entry.note)[0];
  return token == null ? entry.category : `${entry.category}:${token}`;
};

/**
 * Categories where a recurring charge is a genuine obligation rather than a
 * habit. A £30 dinner on the 19th of every month is regular and worth knowing
 * about, but it is not money that leaves "without a decision" — you can simply
 * not go. Conflating the two produces a committed-spend figure that overstates
 * how trapped the household actually is, which is the opposite of useful.
 */
const COMMITTED_CATEGORIES = new Set<CategoryId>([
  'living_home_rent',
  'living_home_utilities',
  'mobility_transport_car_insurance',
  'leisure_lifestyle_subscriptions',
  'family_education_school_fees',
  'family_education_childcare',
  'personal_health_fitness'
]);

export const isCommittedCategory = (category: CategoryId): boolean =>
  COMMITTED_CATEGORIES.has(category);

export interface RecurringSeries {
  key: string;
  label: string;
  category: CategoryId;
  /** An obligation (rent, a subscription) rather than a regular habit. */
  committed: boolean;
  cadence: Cadence;
  /** Typical amount in base currency. Median, so one odd month cannot skew it. */
  typicalAmount: number;
  /** `typicalAmount` normalised to a monthly figure, for the committed total. */
  monthlyEquivalent: number;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  nextExpected: string;
  /** False when it has not appeared for well over its usual gap — likely cancelled. */
  active: boolean;
  confidence: 'high' | 'medium';
}

export interface RecurringOptions {
  now?: Date;
  /** Occurrences required before a pattern is believed at all. */
  minOccurrences?: number;
}

/** Beyond this much variation in spacing, it is not a schedule. */
const MAX_INTERVAL_VARIATION = 0.3;
/** Beyond this much variation in amount, it is not the same recurring charge. */
const MAX_AMOUNT_VARIATION = 0.25;
/** How far past the expected date before a series is treated as lapsed. */
const LAPSE_FACTOR = 1.8;

export const detectRecurring = (
  entries: Entry[],
  options: RecurringOptions = {}
): RecurringSeries[] => {
  const now = options.now ?? new Date();
  const minOccurrences = options.minOccurrences ?? 3;

  const grouped = new Map<string, Entry[]>();
  for (const entry of entries) {
    // Income has its own rhythm and is not "committed spending".
    if (isIncome(entry.category)) continue;
    if (Number.isNaN(new Date(entry.date).getTime())) continue;
    const key = seriesKey(entry);
    const bucket = grouped.get(key) ?? [];
    bucket.push(entry);
    grouped.set(key, bucket);
  }

  const series: RecurringSeries[] = [];

  for (const [key, bucket] of grouped) {
    if (bucket.length < minOccurrences) continue;

    const sorted = [...bucket].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const intervals: number[] = [];
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = new Date(sorted[index - 1]!.date).getTime();
      const current = new Date(sorted[index]!.date).getTime();
      intervals.push((current - previous) / DAY_MS);
    }
    if (intervals.length === 0) continue;

    // Two charges on the same day are a split payment, not a schedule.
    if (intervals.some((interval) => interval < 1)) continue;

    const medianInterval = median(intervals);
    const band = CADENCE_BANDS.find(
      (candidate) => medianInterval >= candidate.min && medianInterval <= candidate.max
    );
    if (band == null) continue;

    if (coefficientOfVariation(intervals) > MAX_INTERVAL_VARIATION) continue;

    const amounts = sorted.map((entry) => entry.baseAmount);
    const amountVariation = coefficientOfVariation(amounts);
    if (amountVariation > MAX_AMOUNT_VARIATION) continue;

    const typicalAmount = roundMoney(median(amounts));
    const lastSeenEntry = sorted[sorted.length - 1]!;
    const firstSeenEntry = sorted[0]!;
    const lastSeenMs = new Date(lastSeenEntry.date).getTime();
    const nextExpectedMs = lastSeenMs + medianInterval * DAY_MS;

    series.push({
      key,
      label:
        tokenise(lastSeenEntry.note)[0] != null
          ? `${CATEGORY_META[lastSeenEntry.category].label} · ${lastSeenEntry.note.trim()}`
          : CATEGORY_META[lastSeenEntry.category].label,
      category: lastSeenEntry.category,
      committed: isCommittedCategory(lastSeenEntry.category),
      cadence: band.cadence,
      typicalAmount,
      monthlyEquivalent: roundMoney(typicalAmount * band.perMonth),
      occurrences: sorted.length,
      firstSeen: firstSeenEntry.date,
      lastSeen: lastSeenEntry.date,
      nextExpected: new Date(nextExpectedMs).toISOString(),
      active: now.getTime() <= lastSeenMs + medianInterval * LAPSE_FACTOR * DAY_MS,
      confidence:
        sorted.length >= 4 && amountVariation <= 0.1 && coefficientOfVariation(intervals) <= 0.15
          ? 'high'
          : 'medium'
    });
  }

  return series.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);
};

export interface CommittedSpend {
  /** Obligations only — the figure that answers "what am I locked into?". */
  committedTotal: number;
  /** Regular but discretionary repeats — predictable, but cancellable. */
  habitualTotal: number;
  /** Both together. */
  monthlyTotal: number;
  committed: RecurringSeries[];
  habitual: RecurringSeries[];
  lapsed: RecurringSeries[];
}

const sumMonthly = (series: RecurringSeries[]): number =>
  roundMoney(series.reduce((sum, item) => sum + item.monthlyEquivalent, 0));

/**
 * Split recurring spending into what is owed and what is merely habitual.
 *
 * The separation is the point. "You are committed to £1,260 a month" is
 * actionable; the same sentence with a fortnightly takeaway folded in is just
 * wrong, and wrong in the direction that makes someone feel more stuck than
 * they are.
 */
export const committedSpend = (
  entries: Entry[],
  options: RecurringOptions = {}
): CommittedSpend => {
  const all = detectRecurring(entries, options);
  const active = all.filter((item) => item.active);
  const committed = active.filter((item) => item.committed);
  const habitual = active.filter((item) => !item.committed);

  return {
    committedTotal: sumMonthly(committed),
    habitualTotal: sumMonthly(habitual),
    monthlyTotal: sumMonthly(active),
    committed,
    habitual,
    lapsed: all.filter((item) => !item.active)
  };
};
