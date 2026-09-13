import { CATEGORY_META, isCategoryId, type CategoryId } from './categories';
import { roundMoney } from './money';
import { tokenise } from './suggestions';
import type { CurrencyCode, Entry, Favourite } from './types';

/**
 * Favourites — the shortcuts each person keeps for what they buy repeatedly.
 *
 * Two things make these different from the ranked chips. They are *chosen*
 * rather than inferred, so nothing appears that the household did not ask for;
 * and they carry a `person`, so one phone can hold both people's shortcuts and
 * either of them can log the other's spending without retyping anything.
 */

export interface FavouriteDraft {
  label: string;
  person: string | null;
  category: CategoryId;
  currency: CurrencyCode;
  amount: number | null;
  note: string;
}

const newId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `fav-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

export const createFavourite = (draft: FavouriteDraft): Favourite => {
  const now = new Date().toISOString();
  return {
    id: newId(),
    label: draft.label.trim() || CATEGORY_META[draft.category].label,
    person: draft.person,
    category: draft.category,
    currency: draft.currency,
    amount: draft.amount == null ? null : roundMoney(draft.amount),
    note: draft.note.trim(),
    useCount: 0,
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now
  };
};

export const markFavouriteUsed = (favourite: Favourite): Favourite => {
  const now = new Date().toISOString();
  return { ...favourite, useCount: favourite.useCount + 1, lastUsedAt: now, updatedAt: now };
};

/**
 * The favourites to show for a given person: their own, plus shared household
 * ones. Passing null shows everything, which is how the "everyone" tab works.
 */
export const favouritesFor = (favourites: Favourite[], person: string | null): Favourite[] => {
  if (person == null) return favourites;
  return favourites.filter((favourite) => favourite.person === person || favourite.person === null);
};

/** Who has favourites, for building the tab strip. */
export const peopleWithFavourites = (favourites: Favourite[]): string[] => {
  const people = new Set<string>();
  for (const favourite of favourites) {
    if (favourite.person != null) people.add(favourite.person);
  }
  return [...people].sort();
};

/** How a favourite and an entry are considered "the same thing". */
const shortcutKey = (category: string, note: string): string => {
  const token = tokenise(note)[0];
  return token == null ? category : `${category}:${token}`;
};

export interface FavouriteSuggestion {
  label: string;
  person: string | null;
  category: CategoryId;
  currency: CurrencyCode;
  note: string;
  /** How many times this person has logged something matching it. */
  count: number;
  /** Median of what they usually spend, offered only as a hint. */
  typicalAmount: number;
}

export interface SuggestOptions {
  now?: Date;
  limit?: number;
  /** Times a pattern must appear before it is worth offering. */
  minCount?: number;
}

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

/**
 * Propose favourites from what a person actually logs, so the list starts
 * useful instead of empty — but only ever as a *suggestion*. Nothing is added
 * without a tap, which is the point: the household chooses its own shortcuts
 * rather than having them chosen for them.
 *
 * Entries with no person attached are only considered when suggesting shared
 * favourites, so unattributed spending does not get silently assigned to
 * whoever happens to be looking.
 */
export const suggestFavourites = (
  entries: Entry[],
  person: string | null,
  existing: Favourite[],
  options: SuggestOptions = {}
): FavouriteSuggestion[] => {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 5;
  const minCount = options.minCount ?? 3;

  // Shared favourites show on every person's tab, so a pattern already covered
  // by one must not be proposed again — otherwise the app offers to add "Rent"
  // directly underneath the Rent shortcut it is already showing.
  // Keyed on the note, never the label. Falling back to the label looked
  // harmless but produced a key entries can never generate: a shared "Rent"
  // favourite with no note keyed as `living_home_rent:rent`, while the rent
  // entries themselves key as `living_home_rent`, so the dedup silently missed
  // and the app offered to add a favourite it was already displaying.
  const alreadySaved = new Set(
    existing
      .filter((favourite) => favourite.person === person || favourite.person === null)
      .map((favourite) => shortcutKey(favourite.category, favourite.note))
  );

  const halfLifeMs = 60 * 24 * 60 * 60 * 1000;
  const groups = new Map<
    string,
    { category: CategoryId; note: string; amounts: number[]; score: number; currency: CurrencyCode }
  >();

  for (const entry of entries) {
    if (entry.user !== person) continue;
    if (!isCategoryId(entry.category)) continue;

    const when = new Date(entry.date).getTime();
    if (Number.isNaN(when)) continue;

    const key = shortcutKey(entry.category, entry.note);
    if (alreadySaved.has(key)) continue;

    const weight = Math.pow(0.5, Math.max(0, now.getTime() - when) / halfLifeMs);
    const group = groups.get(key) ?? {
      category: entry.category,
      note: entry.note.trim(),
      amounts: [],
      score: 0,
      currency: entry.currency
    };

    group.amounts.push(entry.amount);
    group.score += weight;
    // Keep the most descriptive note seen, not the last one.
    if (entry.note.trim().length > group.note.length) group.note = entry.note.trim();
    groups.set(key, group);
  }

  return [...groups.values()]
    .filter((group) => group.amounts.length >= minCount)
    .sort((a, b) => b.score - a.score || a.note.localeCompare(b.note))
    .slice(0, limit)
    .map((group) => ({
      label: group.note !== '' ? group.note : CATEGORY_META[group.category].label,
      person,
      category: group.category,
      currency: group.currency,
      note: group.note,
      count: group.amounts.length,
      typicalAmount: roundMoney(median(group.amounts))
    }));
};
