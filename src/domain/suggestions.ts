import { CATEGORY_IDS, CATEGORY_META, isIncome, type CategoryId } from './categories';
import type { Entry } from './types';

/**
 * Ranking the categories a person actually uses.
 *
 * v1 opened a 24-item dropdown defaulted to Supermarket regardless of what the
 * household ever picked. The ordering here is derived from real history so the
 * common cases surface as one-tap chips.
 */

export interface CategoryScore {
  category: CategoryId;
  score: number;
  count: number;
  lastUsedAt: string | null;
}

/**
 * How quickly an old entry stops counting. Thirty days means a category used
 * heavily last month still ranks, but a habit dropped six months ago fades —
 * spending patterns shift, and the chips should follow rather than ossify.
 */
const DEFAULT_HALF_LIFE_DAYS = 30;

/** Sensible starting order before there is any history to learn from. */
const COLD_START: CategoryId[] = [
  'living_home_supermarket',
  'leisure_lifestyle_eating_out',
  'mobility_transport_fuel',
  'living_home_utilities',
  'leisure_lifestyle_entertainment',
  'personal_health_healthcare'
];

export interface RankOptions {
  now?: Date;
  halfLifeDays?: number;
  /** Restrict to income or expense categories. */
  kind?: 'income' | 'expense';
}

export const rankCategories = (entries: Entry[], options: RankOptions = {}): CategoryScore[] => {
  const now = options.now ?? new Date();
  const halfLife = options.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;
  const nowMs = now.getTime();
  const halfLifeMs = halfLife * 24 * 60 * 60 * 1000;

  const stats = new Map<CategoryId, { score: number; count: number; lastUsedAt: string | null }>();

  for (const entry of entries) {
    if (options.kind != null) {
      const entryKind = isIncome(entry.category) ? 'income' : 'expense';
      if (entryKind !== options.kind) continue;
    }

    const when = new Date(entry.date).getTime();
    if (Number.isNaN(when)) continue;

    // Future-dated entries score as if they were today rather than above 1.
    const ageMs = Math.max(0, nowMs - when);
    const weight = Math.pow(0.5, ageMs / halfLifeMs);

    const current = stats.get(entry.category) ?? { score: 0, count: 0, lastUsedAt: null };
    current.score += weight;
    current.count += 1;
    if (current.lastUsedAt == null || entry.date > current.lastUsedAt) {
      current.lastUsedAt = entry.date;
    }
    stats.set(entry.category, current);
  }

  return [...stats.entries()]
    .map(([category, value]) => ({ category, ...value }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Stable tiebreak so the chips do not reshuffle between renders.
      return a.category.localeCompare(b.category);
    });
};

/**
 * The categories to offer as one-tap chips.
 *
 * Always returns `limit` of them: real usage first, topped up from a sensible
 * default so a brand-new install is not staring at an empty row.
 */
export const suggestCategoryChips = (
  entries: Entry[],
  options: RankOptions & { limit?: number } = {}
): CategoryId[] => {
  const limit = options.limit ?? 6;
  const ranked = rankCategories(entries, { ...options, kind: options.kind ?? 'expense' })
    .map((item) => item.category)
    .filter((category) => (options.kind === 'income' ? isIncome(category) : !isIncome(category)));

  const chips = ranked.slice(0, limit);
  if (chips.length >= limit) return chips;

  const fallback = options.kind === 'income' ? CATEGORY_IDS.filter(isIncome) : COLD_START;
  for (const category of fallback) {
    if (chips.length >= limit) break;
    if (!chips.includes(category)) chips.push(category);
  }

  return chips;
};

/**
 * What this household's own notes say a word means.
 *
 * "tesco" → Supermarket is learned from their entries rather than from a list I
 * guessed at, so it adapts to the shops they actually use. Beats the built-in
 * keyword table, which only exists to cover the cold start.
 */
export const learnNoteAssociations = (entries: Entry[]): Map<string, CategoryId> => {
  const counts = new Map<string, Map<CategoryId, number>>();

  for (const entry of entries) {
    for (const token of tokenise(entry.note)) {
      const forToken = counts.get(token) ?? new Map<CategoryId, number>();
      forToken.set(entry.category, (forToken.get(entry.category) ?? 0) + 1);
      counts.set(token, forToken);
    }
  }

  const learned = new Map<string, CategoryId>();
  for (const [token, byCategory] of counts) {
    let best: { category: CategoryId; count: number } | null = null;
    for (const [category, count] of byCategory) {
      if (best == null || count > best.count || (count === best.count && category < best.category)) {
        best = { category, count };
      }
    }
    // One sighting is coincidence, not a pattern.
    if (best != null && best.count >= 2) learned.set(token, best.category);
  }

  return learned;
};

/** Words too common or too short to carry meaning. */
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'was', 'are', 'our', 'out', 'per'
]);

export const tokenise = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token) && !/^\d+$/.test(token));

/**
 * Cold-start keywords, used only until the household's own history takes over.
 * Intentionally short — a wrong guess here costs more trust than no guess.
 */
export const CATEGORY_KEYWORDS: Partial<Record<CategoryId, string[]>> = {
  living_home_supermarket: ['tesco', 'sainsburys', 'aldi', 'lidl', 'asda', 'waitrose', 'morrisons', 'groceries', 'supermarket', 'pingo', 'continente'],
  living_home_utilities: ['electric', 'electricity', 'gas', 'water', 'council', 'internet', 'broadband', 'phone'],
  living_home_rent: ['rent', 'mortgage', 'landlord'],
  living_home_home_garden: ['ikea', 'garden', 'furniture', 'diy'],
  mobility_transport_fuel: ['petrol', 'diesel', 'fuel', 'shell', 'esso', 'texaco', 'galp'],
  mobility_transport_travel_commuting: ['train', 'bus', 'uber', 'taxi', 'flight', 'parking', 'toll'],
  mobility_transport_car_insurance: ['insurance'],
  mobility_transport_car_maintenance: ['garage', 'tyres', 'service', 'mot'],
  personal_health_healthcare: ['pharmacy', 'dentist', 'doctor', 'optician', 'prescription'],
  personal_health_personal_care: ['haircut', 'barber', 'salon'],
  personal_health_fitness: ['gym', 'pilates', 'yoga'],
  leisure_lifestyle_eating_out: ['coffee', 'lunch', 'dinner', 'restaurant', 'cafe', 'pub', 'takeaway', 'pizza', 'costa', 'starbucks', 'breakfast', 'brunch'],
  leisure_lifestyle_entertainment: ['cinema', 'concert', 'tickets', 'theatre'],
  leisure_lifestyle_subscriptions: ['netflix', 'spotify', 'subscription', 'icloud', 'prime', 'disney'],
  leisure_lifestyle_clothing: ['zara', 'clothes', 'shoes', 'primark', 'uniqlo'],
  leisure_lifestyle_travel_holidays: ['hotel', 'airbnb', 'holiday'],
  family_education_childcare: ['nursery', 'childminder', 'babysitter'],
  family_education_school_fees: ['school', 'tuition'],
  family_education_gifts_celebrations: ['gift', 'present', 'birthday'],
  income_salary: ['salary', 'payroll', 'wages']
};

const KEYWORD_INDEX: Map<string, CategoryId> = (() => {
  const index = new Map<string, CategoryId>();
  for (const [category, words] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const word of words ?? []) index.set(word, category as CategoryId);
  }
  return index;
})();

export interface CategoryGuess {
  category: CategoryId;
  /** 'learned' from their own entries, 'keyword' from the built-in table. */
  via: 'learned' | 'keyword' | 'label';
  matched: string;
}

/**
 * Guess a category from free text. Returns null rather than guessing badly —
 * a silently wrong category is worse than asking.
 */
export const guessCategory = (
  text: string,
  learned: Map<string, CategoryId> = new Map()
): CategoryGuess | null => {
  const tokens = tokenise(text);

  // The household's own history wins over anything built in.
  for (const token of tokens) {
    const category = learned.get(token);
    if (category != null) return { category, via: 'learned', matched: token };
  }

  for (const token of tokens) {
    const category = KEYWORD_INDEX.get(token);
    if (category != null) return { category, via: 'keyword', matched: token };
  }

  // Finally, the category's own label ("eating out", "fuel").
  const lowered = text.toLowerCase();
  for (const id of CATEGORY_IDS) {
    const labelWords = CATEGORY_META[id].label.toLowerCase();
    if (labelWords.length >= 4 && lowered.includes(labelWords)) {
      return { category: id, via: 'label', matched: labelWords };
    }
  }

  return null;
};
