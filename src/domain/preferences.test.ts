import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  UNCLAIMED,
  clearPreferences,
  hasOverrides,
  migrateLegacyView,
  resolvePreferences,
  setPreferences,
  type PreferenceMap
} from './preferences';

describe('resolvePreferences', () => {
  it('returns the defaults when nobody has overridden anything', () => {
    expect(resolvePreferences(undefined, 'Miguel')).toEqual(DEFAULT_PREFERENCES);
    expect(resolvePreferences({}, 'Miguel')).toEqual(DEFAULT_PREFERENCES);
  });

  it('applies only that person\'s overrides', () => {
    const map: PreferenceMap = {
      Miguel: { view: 'balance' },
      Ines: { range: '12m' }
    };

    expect(resolvePreferences(map, 'Miguel').view).toBe('balance');
    expect(resolvePreferences(map, 'Miguel').range).toBe(DEFAULT_PREFERENCES.range);
    expect(resolvePreferences(map, 'Ines').view).toBe('spending');
    expect(resolvePreferences(map, 'Ines').range).toBe('12m');
  });

  it('fills in cards a stored override does not mention', () => {
    // An override written before a card existed must not leave that card
    // undefined — it gets the default, so new cards appear rather than vanish.
    const map: PreferenceMap = { Miguel: { cards: { committed: false } } };
    const resolved = resolvePreferences(map, 'Miguel');

    expect(resolved.cards.committed).toBe(false);
    expect(resolved.cards.trend).toBe(true);
    expect(resolved.cards.whereItGoes).toBe(true);
  });

  it('ignores a stored range that is not a real range', () => {
    const map = { Miguel: { range: 'last-tuesday' } } as unknown as PreferenceMap;
    expect(resolvePreferences(map, 'Miguel').range).toBe(DEFAULT_PREFERENCES.range);
  });

  it('has a slot for a phone nobody has claimed yet', () => {
    const map: PreferenceMap = { [UNCLAIMED]: { range: '6m' } };
    expect(resolvePreferences(map, null).range).toBe('6m');
  });
});

describe('setPreferences', () => {
  it('leaves the other person alone', () => {
    const map = setPreferences({ Ines: { view: 'balance' } }, 'Miguel', { range: '1m' });

    expect(map.Miguel).toEqual({ range: '1m' });
    expect(map.Ines).toEqual({ view: 'balance' });
  });

  it('merges card toggles instead of replacing them', () => {
    // Turning off a second card must not switch the first one back on.
    let map = setPreferences({}, 'Miguel', { cards: { trend: false } });
    map = setPreferences(map, 'Miguel', { cards: { committed: false } });

    const resolved = resolvePreferences(map, 'Miguel');
    expect(resolved.cards.trend).toBe(false);
    expect(resolved.cards.committed).toBe(false);
    expect(resolved.cards.choices).toBe(true);
  });

  it('keeps earlier settings when a later one changes', () => {
    let map = setPreferences({}, 'Miguel', { view: 'balance' });
    map = setPreferences(map, 'Miguel', { range: '12m' });

    expect(resolvePreferences(map, 'Miguel')).toMatchObject({ view: 'balance', range: '12m' });
  });
});

describe('hasOverrides', () => {
  it('is false on the defaults', () => {
    expect(hasOverrides({}, 'Miguel')).toBe(false);
    expect(hasOverrides(setPreferences({}, 'Miguel', { range: '3m' }), 'Miguel')).toBe(false);
  });

  it('is true once anything departs from them', () => {
    expect(hasOverrides(setPreferences({}, 'Miguel', { range: '12m' }), 'Miguel')).toBe(true);
    expect(hasOverrides(setPreferences({}, 'Miguel', { view: 'balance' }), 'Miguel')).toBe(true);
    expect(
      hasOverrides(setPreferences({}, 'Miguel', { cards: { trend: false } }), 'Miguel')
    ).toBe(true);
  });

  it('does not report one person\'s overrides against the other', () => {
    const map = setPreferences({}, 'Ines', { view: 'balance' });
    expect(hasOverrides(map, 'Miguel')).toBe(false);
    expect(hasOverrides(map, 'Ines')).toBe(true);
  });
});

describe('clearPreferences', () => {
  it('puts one person back on the defaults without touching the other', () => {
    let map = setPreferences({}, 'Miguel', { view: 'balance' });
    map = setPreferences(map, 'Ines', { range: '12m' });

    const cleared = clearPreferences(map, 'Miguel');
    expect(resolvePreferences(cleared, 'Miguel')).toEqual(DEFAULT_PREFERENCES);
    expect(resolvePreferences(cleared, 'Ines').range).toBe('12m');
  });
});

describe('migrateLegacyView', () => {
  it('carries a previously chosen balance view into the owner\'s slot', () => {
    // Without this, updating the app silently puts them back on Spending.
    const map = migrateLegacyView({}, 'Miguel', 'balance');
    expect(resolvePreferences(map, 'Miguel').view).toBe('balance');
  });

  it('does nothing for the default view', () => {
    expect(migrateLegacyView({}, 'Miguel', 'spending')).toEqual({});
    expect(migrateLegacyView({}, 'Miguel', undefined)).toEqual({});
  });

  it('never overwrites a choice already made in the new shape', () => {
    const map = setPreferences({}, 'Miguel', { view: 'spending' });
    expect(resolvePreferences(migrateLegacyView(map, 'Miguel', 'balance'), 'Miguel').view).toBe(
      'spending'
    );
  });
});
