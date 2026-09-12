import { useCallback, useEffect, useRef, useState } from 'react';
import type { CategoryId } from '../domain/categories';
import { resolveRate } from '../domain/fx';
import { roundMoney, toBaseAmount } from '../domain/money';
import { emptyLedger, type CurrencyCode, type Entry, type EntrySource, type LedgerState } from '../domain/types';
import { compareByDateDesc, mergeLedgers } from '../sync/merge';
import { loadLedger, saveLedger } from '../storage/ledgerStore';

export interface EntryDraft {
  amount: number;
  currency: CurrencyCode;
  category: CategoryId;
  date: string;
  note: string;
  user: string | null;
  source: EntrySource;
}

export type AddResult =
  | { ok: true; entry: Entry; approximateRate: boolean }
  | { ok: false; reason: 'no-rate' };

const newId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `mm-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

/**
 * The ledger and the operations on it.
 *
 * `revision` counts local edits; `syncedRevision` records the revision last
 * confirmed onto Drive. Anything between the two is unsaved work. Counting
 * rather than holding a boolean means an edit made *during* a sync is not
 * silently marked clean when that sync finishes.
 */
export const useLedger = () => {
  const [ledger, setLedger] = useState<LedgerState>(emptyLedger);
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [syncedRevision, setSyncedRevision] = useState(0);
  const loadedRef = useRef(false);

  useEffect(() => {
    void loadLedger().then((state) => {
      setLedger(state);
      setLoaded(true);
      loadedRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    void saveLedger(ledger);
  }, [ledger]);

  const bump = useCallback(() => setRevision((current) => current + 1), []);

  const addEntry = useCallback(
    async (draft: EntryDraft): Promise<AddResult> => {
      const resolution = await resolveRate(draft.currency, draft.date);
      // No network and nothing cached. Refuse rather than invent a rate — a
      // wrong rate is frozen onto the entry and silently wrong forever.
      if (resolution == null) return { ok: false, reason: 'no-rate' };

      const now = new Date().toISOString();
      const amount = roundMoney(draft.amount);
      const entry: Entry = {
        id: newId(),
        amount,
        currency: draft.currency,
        rateToBase: resolution.rate,
        rateDate: draft.currency === 'GBP' ? null : resolution.rateDate,
        baseAmount: toBaseAmount(amount, resolution.rate),
        category: draft.category,
        date: draft.date,
        note: draft.note.trim(),
        user: draft.user,
        createdAt: now,
        updatedAt: now,
        source: draft.source
      };

      setLedger((current) => ({
        entries: [entry, ...current.entries].sort(compareByDateDesc),
        tombstones: current.tombstones.filter((tombstone) => tombstone.id !== entry.id)
      }));
      bump();

      return { ok: true, entry, approximateRate: resolution.approximate };
    },
    [bump]
  );

  const updateEntry = useCallback(
    (id: string, patch: Partial<Omit<Entry, 'id' | 'createdAt'>>) => {
      setLedger((current) => ({
        entries: current.entries
          .map((entry) => {
            if (entry.id !== id) return entry;
            const next = { ...entry, ...patch, updatedAt: new Date().toISOString() };
            // Keep the frozen base amount consistent if the amount or rate moved.
            if (patch.amount != null || patch.rateToBase != null) {
              next.amount = roundMoney(next.amount);
              next.baseAmount = toBaseAmount(next.amount, next.rateToBase);
            }
            return next;
          })
          .sort(compareByDateDesc),
        tombstones: current.tombstones.filter((tombstone) => tombstone.id !== id)
      }));
      bump();
    },
    [bump]
  );

  const deleteEntry = useCallback(
    (id: string) => {
      setLedger((current) => ({
        entries: current.entries.filter((entry) => entry.id !== id),
        tombstones: [
          ...current.tombstones.filter((tombstone) => tombstone.id !== id),
          { id, deletedAt: new Date().toISOString() }
        ]
      }));
      bump();
    },
    [bump]
  );

  /**
   * Fold in state from a sync or an import. Never replaces — merging is what
   * guarantees a device cannot lose its own entries to a bad remote read.
   */
  const mergeIn = useCallback((incoming: LedgerState) => {
    setLedger((current) => mergeLedgers(current, incoming));
  }, []);

  const markSynced = useCallback((atRevision: number) => {
    setSyncedRevision(atRevision);
  }, []);

  return {
    ledger,
    loaded,
    revision,
    dirty: revision !== syncedRevision,
    addEntry,
    updateEntry,
    deleteEntry,
    mergeIn,
    markSynced
  };
};
