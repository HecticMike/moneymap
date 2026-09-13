import type { RangeId } from './insights';

/**
 * Per-person display preferences.
 *
 * The app ships opinionated defaults and each person can override them. The
 * defaults are not a starting point to be configured away — they are the
 * considered answer, and an override is a deliberate departure from it.
 *
 * **Scope.** These are stored per device but keyed by person. Today that
 * distinction is invisible, because there is a phone each — device scope and
 * person scope are the same thing. It matters the moment a phone is shared or
 * a third person appears, and keying by person now costs nothing while making
 * that case work. If preferences should later follow a person between devices,
 * the map lifts straight into the synced ledger without reshaping.
 *
 * Deliberately *not* synced for now: Inês wanting fewer cards on her screen
 * should not change what Miguel sees.
 */

export type ViewMode = 'spending' | 'balance';

export type CardId = 'trend' | 'choices' | 'whereItGoes' | 'committed';

export const CARDS: Array<{ id: CardId; label: string; hint: string }> = [
  { id: 'trend', label: 'Month-by-month chart', hint: 'Chosen spend against your usual level.' },
  { id: 'choices', label: 'Where the choices went', hint: 'Share of what you decided, with trends.' },
  { id: 'whereItGoes', label: 'Where it goes', hint: 'Everything by group, obligations included.' },
  { id: 'committed', label: 'Committed each month', hint: 'Bills, subscriptions and regular habits.' }
];

export interface Preferences {
  view: ViewMode;
  /** Which insight cards to show. The headline is not optional — it is the app. */
  cards: Record<CardId, boolean>;
  /** Remembered rather than reset each session. */
  range: RangeId;
}

/**
 * The considered defaults. Spending-only, everything shown, three months.
 */
export const DEFAULT_PREFERENCES: Preferences = {
  view: 'spending',
  cards: { trend: true, choices: true, whereItGoes: true, committed: true },
  range: '3m'
};

/** Key used before anyone has said whose phone this is. */
export const UNCLAIMED = '_unclaimed';

/**
 * A stored override. Cards are partial in their own right: someone who has
 * turned off one card has an entry for that card only, so a card added in a
 * later build still picks up its default rather than reading as `undefined`.
 */
export interface PreferencePatch {
  view?: ViewMode;
  cards?: Partial<Record<CardId, boolean>>;
  range?: RangeId;
}

export type PreferenceMap = Record<string, PreferencePatch>;

const isRangeId = (value: unknown): value is RangeId =>
  value === '1m' || value === '3m' || value === '6m' || value === '12m' || value === 'all';

/**
 * Resolve one person's preferences over the defaults.
 *
 * Merges rather than replaces, so a stored override from an older build that
 * knows nothing about a newly added card still gets that card's default rather
 * than `undefined`.
 */
export const resolvePreferences = (
  map: PreferenceMap | undefined,
  person: string | null
): Preferences => {
  const stored = map?.[person ?? UNCLAIMED];

  return {
    view: stored?.view === 'balance' ? 'balance' : DEFAULT_PREFERENCES.view,
    cards: { ...DEFAULT_PREFERENCES.cards, ...(stored?.cards ?? {}) },
    range: isRangeId(stored?.range) ? stored.range : DEFAULT_PREFERENCES.range
  };
};

/** Apply a patch to one person's slot, leaving everyone else untouched. */
export const setPreferences = (
  map: PreferenceMap | undefined,
  person: string | null,
  patch: PreferencePatch
): PreferenceMap => {
  const key = person ?? UNCLAIMED;
  const current = map?.[key] ?? {};

  return {
    ...(map ?? {}),
    [key]: {
      ...current,
      ...patch,
      // Cards merge rather than replace, so toggling one never drops the rest.
      ...(patch.cards == null ? {} : { cards: { ...(current.cards ?? {}), ...patch.cards } })
    }
  };
};

/** True when this person has departed from the defaults in any way. */
export const hasOverrides = (map: PreferenceMap | undefined, person: string | null): boolean => {
  const resolved = resolvePreferences(map, person);
  if (resolved.view !== DEFAULT_PREFERENCES.view) return true;
  if (resolved.range !== DEFAULT_PREFERENCES.range) return true;
  return CARDS.some((card) => resolved.cards[card.id] !== DEFAULT_PREFERENCES.cards[card.id]);
};

export const clearPreferences = (
  map: PreferenceMap | undefined,
  person: string | null
): PreferenceMap => {
  const next = { ...(map ?? {}) };
  delete next[person ?? UNCLAIMED];
  return next;
};

/**
 * Carry a pre-0.3 flat `view` setting into the per-person map.
 *
 * Whoever owns the phone keeps the view they had chosen; without this they
 * would silently be put back on Spending after updating.
 */
export const migrateLegacyView = (
  map: PreferenceMap | undefined,
  person: string | null,
  legacyView: unknown
): PreferenceMap => {
  if (legacyView !== 'balance') return map ?? {};
  if (map?.[person ?? UNCLAIMED]?.view != null) return map;
  return setPreferences(map, person, { view: 'balance' });
};
