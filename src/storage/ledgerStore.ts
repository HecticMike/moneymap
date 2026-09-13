import { parseLedgerFile, serialiseLedgerFile } from '../sync/ledgerFile';
import { emptyLedger, type LedgerState } from '../domain/types';
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
  if (stored == null) return emptyLedger();
  return parseLedgerFile(stored).state;
};

/**
 * Written in exactly the format Drive receives, so the local copy and the
 * remote one cannot drift apart in shape — a mismatch there would show up as a
 * sync that never converges.
 */
export const saveLedger = async (state: LedgerState): Promise<boolean> =>
  dbSet(KEYS.ledger, serialiseLedgerFile(state, new Date().toISOString()));
