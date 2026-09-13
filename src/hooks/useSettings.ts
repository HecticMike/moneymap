import { useCallback, useEffect, useState } from 'react';
import { isCurrencyCode } from '../domain/money';
import { BASE_CURRENCY, type CurrencyCode } from '../domain/types';
import { KEYS, dbGet, dbSet } from '../storage/db';

/**
 * What the app is for, as far as the insights are concerned.
 *
 * `spending` is the default and the point of the app: where the money goes,
 * income ignored entirely. `balance` adds the budget-tracker side — income
 * against outgoings, net, savings rate. Kept as a mode rather than a second app
 * so the balance side has somewhere to grow without the spending view ever
 * having to accommodate it.
 */
export type ViewMode = 'spending' | 'balance';

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

  /** Spending-only by default; the balance view is opt-in. */
  view: ViewMode;
}

const DEFAULTS: Settings = { owner: null, captureCurrency: BASE_CURRENCY, view: 'spending' };

export const useSettings = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void dbGet<Partial<Settings>>(KEYS.settings).then((stored) => {
      setSettings({
        owner: typeof stored?.owner === 'string' && stored.owner !== '' ? stored.owner : null,
        captureCurrency: isCurrencyCode(stored?.captureCurrency)
          ? stored.captureCurrency
          : BASE_CURRENCY,
        view: stored?.view === 'balance' ? 'balance' : 'spending'
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

  const setView = useCallback((view: ViewMode) => update({ view }), [update]);

  return { settings, loaded, setOwner, setCaptureCurrency, setView };
};
