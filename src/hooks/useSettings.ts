import { useCallback, useEffect, useState } from 'react';
import { isCurrencyCode } from '../domain/money';
import { BASE_CURRENCY, type CurrencyCode } from '../domain/types';
import { KEYS, dbGet, dbSet } from '../storage/db';

export interface Settings {
  /**
   * Who this phone belongs to.
   *
   * Deliberately *not* synced — it is a property of the device, not of the
   * household. Syncing it would mean each phone overwriting the other's answer
   * forever. It defaults the person on new entries and decides which
   * favourites open first.
   */
  owner: string | null;

  /**
   * What new entries are captured in.
   *
   * A setting rather than a per-entry toggle because that matches how it is
   * actually used: the household is in Portugal for a week, not switching
   * currency between one coffee and the next. Flip it on arrival, flip it back
   * on the way home. The symbol stays visible on the amount field so a
   * forgotten switch is obvious rather than silent.
   */
  captureCurrency: CurrencyCode;
}

const DEFAULTS: Settings = { owner: null, captureCurrency: BASE_CURRENCY };

export const useSettings = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void dbGet<Partial<Settings>>(KEYS.settings).then((stored) => {
      setSettings({
        owner: typeof stored?.owner === 'string' && stored.owner !== '' ? stored.owner : null,
        captureCurrency: isCurrencyCode(stored?.captureCurrency)
          ? stored.captureCurrency
          : BASE_CURRENCY
      });
      setLoaded(true);
    });
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      void dbSet(KEYS.settings, next);
      return next;
    });
  }, []);

  const setOwner = useCallback((owner: string | null) => update({ owner }), [update]);
  const setCaptureCurrency = useCallback(
    (captureCurrency: CurrencyCode) => update({ captureCurrency }),
    [update]
  );

  return { settings, loaded, setOwner, setCaptureCurrency };
};
