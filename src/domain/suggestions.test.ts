import { describe, expect, it } from 'vitest';
import { guessCategory, learnNoteAssociations, rankCategories, suggestCategoryChips, tokenise } from './suggestions';
import type { CategoryId } from './categories';
import type { Entry } from './types';

const NOW = new Date('2026-09-13T12:00:00.000Z');

const daysAgo = (days: number): string =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

let counter = 0;
const entry = (category: CategoryId, date: string, note = ''): Entry => ({
  id: `e${counter++}`,
  amount: 10,
  currency: 'GBP',
  rateToBase: 1,
  rateDate: null,
  baseAmount: 10,
  category,
  date,
  note,
  user: null,
  createdAt: date,
  updatedAt: date,
  source: 'form'
});

describe('rankCategories', () => {
  it('ranks by how much a category is used', () => {
    const entries = [
      entry('living_home_supermarket', daysAgo(1)),
      entry('living_home_supermarket', daysAgo(2)),
      entry('living_home_supermarket', daysAgo(3)),
      entry('leisure_lifestyle_eating_out', daysAgo(1))
    ];

    const ranked = rankCategories(entries, { now: NOW });
    expect(ranked[0]!.category).toBe('living_home_supermarket');
    expect(ranked[0]!.count).toBe(3);
  });

  it('weights recent use above old use', () => {
    // Four uses last year against two this week: the current habit should win,
    // or the chips ossify around spending that has already stopped.
    const entries = [
      ...Array.from({ length: 4 }, () => entry('leisure_lifestyle_toys', daysAgo(300))),
      entry('mobility_transport_fuel', daysAgo(1)),
      entry('mobility_transport_fuel', daysAgo(2))
    ];

    const ranked = rankCategories(entries, { now: NOW });
    expect(ranked[0]!.category).toBe('mobility_transport_fuel');
  });

  it('separates income from expenses when asked', () => {
    const entries = [entry('income_salary', daysAgo(1)), entry('living_home_rent', daysAgo(1))];

    expect(rankCategories(entries, { now: NOW, kind: 'income' }).map((r) => r.category)).toEqual(['income_salary']);
    expect(rankCategories(entries, { now: NOW, kind: 'expense' }).map((r) => r.category)).toEqual(['living_home_rent']);
  });

  it('records when a category was last used', () => {
    const recent = daysAgo(2);
    const ranked = rankCategories([entry('living_home_rent', daysAgo(40)), entry('living_home_rent', recent)], { now: NOW });
    expect(ranked[0]!.lastUsedAt).toBe(recent);
  });

  it('ignores entries with unreadable dates instead of ranking them NaN', () => {
    const broken = { ...entry('living_home_rent', daysAgo(1)), date: 'not-a-date' };
    const ranked = rankCategories([broken, entry('living_home_rent', daysAgo(1))], { now: NOW });
    expect(ranked[0]!.score).toBeGreaterThan(0);
    expect(Number.isNaN(ranked[0]!.score)).toBe(false);
  });

  it('does not let a future-dated entry outrank everything', () => {
    const future = entry('leisure_lifestyle_toys', new Date(NOW.getTime() + 1e10).toISOString());
    const ranked = rankCategories([future], { now: NOW });
    expect(ranked[0]!.score).toBeLessThanOrEqual(1);
  });
});

describe('suggestCategoryChips', () => {
  it('returns a full row even with no history at all', () => {
    const chips = suggestCategoryChips([], { now: NOW, limit: 6 });
    expect(chips).toHaveLength(6);
    expect(new Set(chips).size).toBe(6);
  });

  it('puts real usage first and tops up from the defaults', () => {
    const chips = suggestCategoryChips([entry('family_education_childcare', daysAgo(1))], {
      now: NOW,
      limit: 6
    });
    expect(chips[0]).toBe('family_education_childcare');
    expect(chips).toHaveLength(6);
    expect(new Set(chips).size).toBe(6);
  });

  it('never mixes income into the expense chips', () => {
    const entries = Array.from({ length: 10 }, () => entry('income_salary', daysAgo(1)));
    const chips = suggestCategoryChips(entries, { now: NOW, kind: 'expense' });
    expect(chips).not.toContain('income_salary');
  });
});

describe('tokenise', () => {
  it('keeps meaningful words and drops noise', () => {
    expect(tokenise('Tesco big shop for the week')).toEqual(['tesco', 'big', 'shop', 'week']);
  });

  it('drops bare numbers and punctuation', () => {
    expect(tokenise('Coffee x2, £3.40!')).toEqual(['coffee']);
  });
});

describe('learnNoteAssociations', () => {
  it('learns a word once it has been seen twice', () => {
    const learned = learnNoteAssociations([
      entry('living_home_supermarket', daysAgo(1), 'Tesco'),
      entry('living_home_supermarket', daysAgo(8), 'Tesco big shop')
    ]);
    expect(learned.get('tesco')).toBe('living_home_supermarket');
  });

  it('ignores a word seen only once', () => {
    // One sighting is coincidence, not a pattern worth acting on.
    const learned = learnNoteAssociations([entry('living_home_supermarket', daysAgo(1), 'Booths')]);
    expect(learned.has('booths')).toBe(false);
  });

  it('picks the category a word is most often used with', () => {
    const learned = learnNoteAssociations([
      entry('leisure_lifestyle_eating_out', daysAgo(1), 'lunch out'),
      entry('leisure_lifestyle_eating_out', daysAgo(2), 'lunch meeting'),
      entry('living_home_supermarket', daysAgo(3), 'lunch things'),
      entry('living_home_supermarket', daysAgo(4), 'other')
    ]);
    expect(learned.get('lunch')).toBe('leisure_lifestyle_eating_out');
  });
});

describe('guessCategory', () => {
  it('uses the built-in keywords when nothing has been learned', () => {
    expect(guessCategory('tesco')?.category).toBe('living_home_supermarket');
    expect(guessCategory('petrol')?.category).toBe('mobility_transport_fuel');
    expect(guessCategory('netflix')?.category).toBe('leisure_lifestyle_subscriptions');
  });

  it('prefers what the household actually does over the built-in table', () => {
    // They shop at a "pharmacy" counter inside a supermarket, say. Their own
    // history should override my guess about what the word means.
    const learned = new Map<string, CategoryId>([['pharmacy', 'living_home_supermarket']]);
    const guess = guessCategory('pharmacy', learned);
    expect(guess?.category).toBe('living_home_supermarket');
    expect(guess?.via).toBe('learned');
  });

  it('falls back to matching a category label', () => {
    expect(guessCategory('eating out with friends')?.category).toBe('leisure_lifestyle_eating_out');
  });

  it('returns null rather than guessing badly', () => {
    expect(guessCategory('zzzz qqqq')).toBeNull();
    expect(guessCategory('')).toBeNull();
  });

  it('reports how it decided, so the UI can show its reasoning', () => {
    expect(guessCategory('tesco')?.via).toBe('keyword');
    expect(guessCategory('tesco')?.matched).toBe('tesco');
  });
});
