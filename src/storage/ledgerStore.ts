import { compareByDateDesc } from '../sync/merge';
import { parseLedgerFile } from '../sync/ledgerFile';
import type { LedgerState } from '../domain/types';
import { KEYS, dbGet, dbSet } from './db';

/**
 * The local copy of the ledger.
 *
 * Everything read back out goes through `parseLedgerFile`, so a partially
 * written or corrupted record degrades to "empty plus warnings" rather than
 * throwing on start-up and bricking the app.
 */
export const loadLedger = async (): Promise<LedgerState> => {
  const stored = await dbGet<unknown>(KEYS.ledger);
  if (stored == null) return { entries: [], tombstones: [] };
  return parseLedgerFile(stored).state;
};

export const saveLedger = async (state: LedgerState): Promise<boolean> =>
  dbSet(KEYS.ledger, {
    app: 'moneymap',
    schema: 3,
    entries: [...state.entries].sort(compareByDateDesc),
    tombstones: state.tombstones,
    syncedAt: new Date().toISOString()
  });
