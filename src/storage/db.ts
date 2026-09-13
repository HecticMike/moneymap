import { clear, createStore, del, get, set } from 'idb-keyval';

/**
 * IndexedDB rather than localStorage.
 *
 * v1 kept everything in localStorage. On iOS that is the first thing Safari
 * evicts under storage pressure, and this household runs the app as a
 * home-screen PWA on two iPhones. IndexedDB under a persisted origin is
 * materially harder to lose. Drive remains the real backstop either way.
 */
const store = createStore('moneymap', 'kv');

export const KEYS = {
  ledger: 'ledger',
  settings: 'settings',
  fxRates: 'fx-rates',
  driveMeta: 'drive-meta',
  importState: 'import-state',
  templates: 'templates'
} as const;

export const dbGet = async <T>(key: string): Promise<T | undefined> => {
  try {
    return await get<T>(key, store);
  } catch (error) {
    console.warn(`[db] read failed for "${key}"`, error);
    return undefined;
  }
};

export const dbSet = async <T>(key: string, value: T): Promise<boolean> => {
  try {
    await set(key, value, store);
    return true;
  } catch (error) {
    console.warn(`[db] write failed for "${key}"`, error);
    return false;
  }
};

export const dbDelete = async (key: string): Promise<void> => {
  try {
    await del(key, store);
  } catch (error) {
    console.warn(`[db] delete failed for "${key}"`, error);
  }
};

export const dbClear = async (): Promise<void> => {
  try {
    await clear(store);
  } catch (error) {
    console.warn('[db] clear failed', error);
  }
};

/**
 * Ask the browser not to evict us. Safari grants this for installed PWAs; in a
 * plain tab it usually declines, which is worth knowing rather than assuming.
 */
export const requestPersistentStorage = async (): Promise<boolean> => {
  if (typeof navigator === 'undefined' || navigator.storage?.persist == null) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
};
