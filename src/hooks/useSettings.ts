import { useCallback, useEffect, useMemo, useState } from 'react';
import { isCurrencyCode } from '../domain/money';
import {
  clearPreferences,
  hasOverrides,
  migrateLegacyView,
  resolvePreferences,
  setPreferences,
  type PreferenceMap,
  type PreferencePatch
} from '../domain/preferences';
import { BASE_CURRENCY, type CurrencyCode } from '../domain/types';
import { KEYS, dbGet, dbSet } from '../storage/db';

export type { ViewMode } from '../domain/preferences';

export interface Settings {
  /**
   * Who this phone belongs to.
   *
   * Deliberately *not* synced — it is a property of the device, not of the
   * household. Syncing it would mean each phone overwriting the other's answer
   * forever. It defaults the person on new entries, decides which favourites
   * open first, and selects whose display preferences apply.
   */
  owner: string | null;

  /**
   * What new entries are captured in.
   *
   * Device-level rather than per-person on purpose: it tracks where the phone
   * currently *is*, and the household travels together. Flip it on arrival,
   * flip it back on the way home.
   */
  captureCurrency: CurrencyCode;

  /** Display overrides, keyed by person. Absent keys fall back to the defaults. */
  byPerson: PreferenceMap;
}

const DEFAULTS: Settings = { owner: null, captureCurrency: BASE_CURRENCY, byPerson: {} };

export const useSettings = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void dbGet<Record<string, unknown>>(KEYS.settings).then((stored) => {
      const owner =
        typeof stored?.owner === 'string' && stored.owner !== '' ? stored.owner : null;

      const byPerson =
        typeof stored?.byPerson === 'object' && stored.byPerson !== null
          ? (stored.byPerson as PreferenceMap)
          : {};

      setSettings({
        owner,
        captureCurrency: isCurrencyCode(stored?.captureCurrency)
          ? stored.captureCurrency
          : BASE_CURRENCY,
        // An earlier build stored `view` flat. Carry it across, or updating
        // would quietly put whoever chose Balance back onto Spending.
        byPerson: migrateLegacyView(byPerson, owner, stored?.view)
      });
      setLoaded(true);
    });
  }, []);

  const persist = useCallback((next: Settings) => {
    setSettings(next);
    void dbSet(KEYS.settings, next);
  }, []);

  const setOwner = useCallback(
    (owner: string | null) => persist({ ...settings, owner }),
    [persist, settings]
  );

  const setCaptureCurrency = useCallback(
    (captureCurrency: CurrencyCode) => persist({ ...settings, captureCurrency }),
    [persist, settings]
  );

  /** Patch the current person's preferences, leaving the other person's alone. */
  const updatePreferences = useCallback(
    (patch: PreferencePatch) =>
      persist({ ...settings, byPerson: setPreferences(settings.byPerson, settings.owner, patch) }),
    [persist, settings]
  );

  const resetPreferences = useCallback(
    () => persist({ ...settings, byPerson: clearPreferences(settings.byPerson, settings.owner) }),
    [persist, settings]
  );

  const preferences = useMemo(
    () => resolvePreferences(settings.byPerson, settings.owner),
    [settings.byPerson, settings.owner]
  );

  return {
    settings,
    preferences,
    customised: hasOverrides(settings.byPerson, settings.owner),
    loaded,
    setOwner,
    setCaptureCurrency,
    updatePreferences,
    resetPreferences
  };
};
