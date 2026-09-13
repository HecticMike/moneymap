import { describe, expect, it } from 'vitest';
import { createFavourite, favouritesFor, markFavouriteUsed, peopleWithFavourites, suggestFavourites } from './favourites';
import type { CategoryId } from './categories';
import type { Entry, Favourite } from './types';

const NOW = new Date(2026, 8, 13, 12, 0, 0);

let counter = 0;
const entry = (
  person: string | null,
  category: CategoryId,
  note: string,
  amount = 20,
  daysAgo = 5
): Entry => {
  const date = new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000);
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
    user: person,
    createdAt: date.toISOString(),
    updatedAt: date.toISOString(),
    source: 'form'
  };
};

const fav = (over: Partial<Favourite> & { id: string }): Favourite => ({
  label: 'Thing',
  person: 'Miguel',
  category: 'living_home_supermarket',
  currency: 'GBP',
  amount: null,
  note: '',
  useCount: 0,
  lastUsedAt: null,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  ...over
});

describe('createFavourite', () => {
  it('stamps merge timestamps so it can sync straight away', () => {
    const created = createFavourite({
      label: 'Tesco',
      person: 'Miguel',
      category: 'living_home_supermarket',
      currency: 'GBP',
      amount: null,
      note: 'Tesco'
    });
    expect(created.createdAt).not.toBe('');
    expect(created.updatedAt).toBe(created.createdAt);
  });

  it('falls back to the category name when no label is given', () => {
    const created = createFavourite({
      label: '   ',
      person: null,
      category: 'living_home_rent',
      currency: 'GBP',
      amount: null,
      note: ''
    });
    expect(created.label).toBe('Rent');
  });
});

describe('markFavouriteUsed', () => {
  it('advances the merge clock, so the other phone learns about the use', () => {
    const before = fav({ id: 'f1', updatedAt: '2026-01-01T00:00:00.000Z' });
    const after = markFavouriteUsed(before);
    expect(after.useCount).toBe(1);
    expect(after.updatedAt > before.updatedAt).toBe(true);
  });
});

describe('favouritesFor', () => {
  const all = [
    fav({ id: 'm', person: 'Miguel', label: 'Tesco' }),
    fav({ id: 'i', person: 'Ines', label: 'Pingo Doce' }),
    fav({ id: 's', person: null, label: 'Rent' })
  ];

  it('gives a person their own plus the shared ones', () => {
    expect(favouritesFor(all, 'Miguel').map((f) => f.label).sort()).toEqual(['Rent', 'Tesco']);
    expect(favouritesFor(all, 'Ines').map((f) => f.label).sort()).toEqual(['Pingo Doce', 'Rent']);
  });

  it('gives everything when no person is named', () => {
    expect(favouritesFor(all, null)).toHaveLength(3);
  });
});

describe('peopleWithFavourites', () => {
  it('lists the people who have any, ignoring shared', () => {
    const all = [fav({ id: 'a', person: 'Miguel' }), fav({ id: 'b', person: null })];
    expect(peopleWithFavourites(all)).toEqual(['Miguel']);
  });
});

describe('suggestFavourites', () => {
  it('proposes what a person logs repeatedly', () => {
    const entries = [
      entry('Miguel', 'living_home_supermarket', 'Tesco', 45, 2),
      entry('Miguel', 'living_home_supermarket', 'Tesco', 52, 9),
      entry('Miguel', 'living_home_supermarket', 'Tesco', 48, 16)
    ];

    const suggestions = suggestFavourites(entries, 'Miguel', [], { now: NOW });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.label).toBe('Tesco');
    expect(suggestions[0]!.count).toBe(3);
    expect(suggestions[0]!.typicalAmount).toBe(48);
    expect(suggestions[0]!.person).toBe('Miguel');
  });

  it('ignores patterns seen only once or twice', () => {
    const entries = [
      entry('Miguel', 'leisure_lifestyle_toys', 'Lego', 30, 2),
      entry('Miguel', 'leisure_lifestyle_toys', 'Lego', 30, 9)
    ];
    expect(suggestFavourites(entries, 'Miguel', [], { now: NOW })).toHaveLength(0);
  });

  it('keeps each person to their own suggestions', () => {
    // The whole point of per-person favourites: Ines's shopping must not be
    // proposed as Miguel's shortcut.
    const entries = [
      entry('Ines', 'living_home_supermarket', 'Pingo Doce', 40, 2),
      entry('Ines', 'living_home_supermarket', 'Pingo Doce', 44, 9),
      entry('Ines', 'living_home_supermarket', 'Pingo Doce', 41, 16)
    ];

    expect(suggestFavourites(entries, 'Miguel', [], { now: NOW })).toHaveLength(0);
    expect(suggestFavourites(entries, 'Ines', [], { now: NOW })).toHaveLength(1);
  });

  it('does not attribute unassigned spending to anyone', () => {
    const entries = [
      entry(null, 'living_home_supermarket', 'Corner shop', 10, 2),
      entry(null, 'living_home_supermarket', 'Corner shop', 12, 9),
      entry(null, 'living_home_supermarket', 'Corner shop', 11, 16)
    ];
    expect(suggestFavourites(entries, 'Miguel', [], { now: NOW })).toHaveLength(0);
    // Only offered as a shared favourite.
    expect(suggestFavourites(entries, null, [], { now: NOW })).toHaveLength(1);
  });

  it('does not re-suggest something already saved', () => {
    const entries = [
      entry('Miguel', 'living_home_supermarket', 'Tesco', 45, 2),
      entry('Miguel', 'living_home_supermarket', 'Tesco', 52, 9),
      entry('Miguel', 'living_home_supermarket', 'Tesco', 48, 16)
    ];
    const existing = [
      fav({ id: 'f1', person: 'Miguel', category: 'living_home_supermarket', note: 'Tesco' })
    ];

    expect(suggestFavourites(entries, 'Miguel', existing, { now: NOW })).toHaveLength(0);
  });

  it('does not propose something already covered by a shared favourite', () => {
    // Shared favourites appear on every tab, so proposing one again offers to
    // add "Rent" directly beneath the Rent shortcut already on screen.
    const entries = [
      entry('Miguel', 'living_home_rent', '', 1250, 5),
      entry('Miguel', 'living_home_rent', '', 1250, 35),
      entry('Miguel', 'living_home_rent', '', 1250, 65)
    ];
    // Label "Rent", no note — exactly how a shared bill favourite is saved.
    const shared = [
      fav({ id: 'shared', person: null, category: 'living_home_rent', label: 'Rent', note: '' })
    ];

    expect(suggestFavourites(entries, 'Miguel', shared, { now: NOW })).toHaveLength(0);
  });

  it('still suggests it for the other person', () => {
    const entries = [
      entry('Ines', 'living_home_supermarket', 'Tesco', 45, 2),
      entry('Ines', 'living_home_supermarket', 'Tesco', 52, 9),
      entry('Ines', 'living_home_supermarket', 'Tesco', 48, 16)
    ];
    const miguelsCopy = [
      fav({ id: 'f1', person: 'Miguel', category: 'living_home_supermarket', note: 'Tesco' })
    ];

    expect(suggestFavourites(entries, 'Ines', miguelsCopy, { now: NOW })).toHaveLength(1);
  });

  it('prefers recent habits over long-abandoned ones', () => {
    const entries = [
      ...Array.from({ length: 4 }, (_, i) =>
        entry('Miguel', 'leisure_lifestyle_toys', 'Old hobby', 30, 300 + i)
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        entry('Miguel', 'leisure_lifestyle_eating_out', 'Coffee', 3, 2 + i * 7)
      )
    ];

    const suggestions = suggestFavourites(entries, 'Miguel', [], { now: NOW, limit: 2 });
    expect(suggestions[0]!.label).toBe('Coffee');
  });

  it('copes with empty input', () => {
    expect(suggestFavourites([], 'Miguel', [], { now: NOW })).toEqual([]);
  });
});
