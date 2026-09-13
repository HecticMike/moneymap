import { useCallback, useEffect, useState } from 'react';
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
}

const DEFAULTS: Settings = { owner: null };

export const useSettings = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void dbGet<Partial<Settings>>(KEYS.settings).then((stored) => {
      setSettings({
        owner: typeof stored?.owner === 'string' && stored.owner !== '' ? stored.owner : null
      });
      setLoaded(true);
    });
  }, []);

  const setOwner = useCallback((owner: string | null) => {
    setSettings((current) => {
      const next = { ...current, owner };
      void dbSet(KEYS.settings, next);
      return next;
    });
  }, []);

  return { settings, loaded, setOwner };
};
