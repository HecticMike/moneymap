import type { Entry, LedgerState, Tombstone } from '../domain/types';

/**
 * Conflict resolution for two phones editing the same ledger offline.
 *
 * Ported from money-map v1's `expenseSync.ts`, which was the strongest code in
 * that codebase: last-write-wins per entry, with tombstones so a deletion on
 * one device is not resurrected by a sync from the other. The shape of the
 * algorithm is unchanged. Two things were fixed — see `entryClock` and
 * `pickLatestEntry`.
 *
 * Known limitation, unchanged from v1 and not solvable without a server:
 * last-write-wins compares wall clocks, so a device whose clock runs fast wins
 * conflicts it should lose. In practice both phones take time from the network
 * and edits to the same entry seconds apart are vanishingly rare in a
 * two-person household.
 */

const timestamp = (value?: string | null): number => {
  if (value == null) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * The merge clock for an entry.
 *
 * v1 computed this as `max(updatedAt, createdAt, date)`. Including `date` was a
 * real bug: `date` is the *transaction* date, chosen freely by the person, and
 * can be in the future. An entry dated next month carried a next-month clock,
 * so it beat any subsequent deletion and could not be deleted — it came back on
 * the next sync, every time.
 *
 * Only system-assigned times are a valid clock. Entries missing them are
 * backfilled once during import (see `legacy.ts`) rather than being papered
 * over here on every merge.
 */
export const entryClock = (entry: Entry): number =>
  Math.max(timestamp(entry.updatedAt), timestamp(entry.createdAt));

export const tombstoneClock = (tombstone: Tombstone): number => timestamp(tombstone.deletedAt);

/**
 * Display order: most recent *transaction* first. Deliberately different from
 * the merge clock — the Activity list should be ordered by when money moved,
 * not by when a row was last edited.
 */
export const compareByDateDesc = (a: Entry, b: Entry): number => {
  const diff = timestamp(b.date) - timestamp(a.date);
  // Stable tiebreak so two phones render identical order.
  return diff !== 0 ? diff : a.id.localeCompare(b.id);
};

export const compareTombstonesByDeletedDesc = (a: Tombstone, b: Tombstone): number =>
  tombstoneClock(b) - tombstoneClock(a);

/** Stable per-entry signature, used for tiebreaks and for state equality. */
const entrySignature = (entry: Entry): string =>
  JSON.stringify([
    entry.id,
    entry.amount,
    entry.currency,
    entry.rateToBase,
    entry.rateDate,
    entry.baseAmount,
    entry.category,
    entry.date,
    entry.note,
    entry.user,
    entry.createdAt,
    entry.updatedAt,
    entry.source
  ]);

/**
 * v1 resolved equal timestamps with `>=`, meaning "whichever happened to be
 * visited second wins". That makes the merge non-commutative: two phones
 * merging the same pair in opposite order reach *different* states and then
 * fight forever, each convinced the other is stale.
 *
 * Ties now break on content signature, which is arbitrary but identical on both
 * devices — so both converge on the same answer and the fight ends.
 */
const pickLatestEntry = (current: Entry | undefined, candidate: Entry): Entry => {
  if (current == null) return candidate;

  const currentClock = entryClock(current);
  const candidateClock = entryClock(candidate);
  if (candidateClock !== currentClock) return candidateClock > currentClock ? candidate : current;

  return entrySignature(candidate) > entrySignature(current) ? candidate : current;
};

const pickLatestTombstone = (
  current: Tombstone | undefined,
  candidate: Tombstone
): Tombstone => {
  if (current == null) return candidate;
  return tombstoneClock(candidate) > tombstoneClock(current) ? candidate : current;
};

/**
 * Merge two ledgers into the state both devices should agree on.
 *
 * Commutative and idempotent: merge(a, b) === merge(b, a), and merging a state
 * with itself is a no-op. Both properties are covered by tests, because a merge
 * that lacks them corrupts data slowly and invisibly.
 */
export const mergeLedgers = (local: LedgerState, remote: LedgerState): LedgerState => {
  const entryById = new Map<string, Entry>();
  const tombstoneById = new Map<string, Tombstone>();

  for (const entry of [...local.entries, ...remote.entries]) {
    entryById.set(entry.id, pickLatestEntry(entryById.get(entry.id), entry));
  }

  for (const tombstone of [...local.tombstones, ...remote.tombstones]) {
    tombstoneById.set(tombstone.id, pickLatestTombstone(tombstoneById.get(tombstone.id), tombstone));
  }

  const entries: Entry[] = [];
  const tombstones: Tombstone[] = [];

  for (const id of new Set([...entryById.keys(), ...tombstoneById.keys()])) {
    const entry = entryById.get(id);
    const tombstone = tombstoneById.get(id);

    if (entry == null) {
      if (tombstone != null) tombstones.push(tombstone);
      continue;
    }

    // Strictly greater: a deletion in the same millisecond as an edit wins,
    // because the delete is the later intent.
    if (tombstone == null || entryClock(entry) > tombstoneClock(tombstone)) {
      entries.push(entry);
    } else {
      tombstones.push(tombstone);
    }
  }

  return {
    entries: entries.sort(compareByDateDesc),
    tombstones: tombstones.sort(compareTombstonesByDeletedDesc)
  };
};

/** Order-independent signature of a whole ledger. */
export const ledgerSignature = (state: LedgerState): string =>
  JSON.stringify({
    entries: [...state.entries].sort((a, b) => a.id.localeCompare(b.id)).map(entrySignature),
    tombstones: [...state.tombstones]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((tombstone) => [tombstone.id, tombstone.deletedAt])
  });

/**
 * Used after a Drive write to confirm what landed matches what was sent, before
 * trusting the round trip.
 */
export const ledgersEqual = (left: LedgerState, right: LedgerState): boolean =>
  ledgerSignature(left) === ledgerSignature(right);
