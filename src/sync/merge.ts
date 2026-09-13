import type { Entry, Favourite, LedgerState, Syncable, Tombstone } from '../domain/types';

/**
 * Conflict resolution for two phones editing the same ledger offline.
 *
 * Ported from money-map v1's `expenseSync.ts`, which was the strongest code in
 * that codebase: last-write-wins per record, with tombstones so a deletion on
 * one device is not resurrected by a sync from the other. The shape of the
 * algorithm is unchanged. Two things were fixed — see `entryClock` and
 * `pickLatest`.
 *
 * The per-record logic is generic so favourites get exactly the same
 * guarantees as entries. Favourites sync because each person's shortcuts have
 * to be available on the other person's phone.
 *
 * Known limitation, unchanged from v1 and not solvable without a server:
 * last-write-wins compares wall clocks, so a device whose clock runs fast wins
 * conflicts it should lose. In practice both phones take time from the network
 * and edits to the same record seconds apart are vanishingly rare in a
 * two-person household.
 */

const timestamp = (value?: string | null): number => {
  if (value == null) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * The merge clock for a record.
 *
 * v1 computed this for entries as `max(updatedAt, createdAt, date)`. Including
 * `date` was a real bug: `date` is the *transaction* date, chosen freely by the
 * person, and can be in the future. An entry dated next month carried a
 * next-month clock, so it beat any subsequent deletion and could not be
 * deleted — it came back on the next sync, every time.
 *
 * Only system-assigned times are a valid clock. Records missing them are
 * backfilled once during import (see `legacy.ts`) rather than being papered
 * over here on every merge.
 */
export const recordClock = (record: Syncable): number =>
  Math.max(timestamp(record.updatedAt), timestamp(record.createdAt));

export const entryClock = (entry: Entry): number => recordClock(entry);

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

/** Stable per-record signature, used for tiebreaks and for state equality. */
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

const favouriteSignature = (favourite: Favourite): string =>
  JSON.stringify([
    favourite.id,
    favourite.label,
    favourite.person,
    favourite.category,
    favourite.currency,
    favourite.amount,
    favourite.note,
    favourite.useCount,
    favourite.lastUsedAt,
    favourite.createdAt,
    favourite.updatedAt
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
const pickLatest = <T extends Syncable>(
  current: T | undefined,
  candidate: T,
  signature: (record: T) => string
): T => {
  if (current == null) return candidate;

  const currentClock = recordClock(current);
  const candidateClock = recordClock(candidate);
  if (candidateClock !== currentClock) return candidateClock > currentClock ? candidate : current;

  return signature(candidate) > signature(current) ? candidate : current;
};

const pickLatestTombstone = (
  current: Tombstone | undefined,
  candidate: Tombstone
): Tombstone => {
  if (current == null) return candidate;
  return tombstoneClock(candidate) > tombstoneClock(current) ? candidate : current;
};

/**
 * Merge one collection and its tombstones. Used for entries and favourites
 * alike, so both get the same convergence guarantees rather than favourites
 * getting a hastily written second implementation.
 */
export const mergeCollection = <T extends Syncable>(
  localRecords: T[],
  remoteRecords: T[],
  localTombstones: Tombstone[],
  remoteTombstones: Tombstone[],
  signature: (record: T) => string
): { records: T[]; tombstones: Tombstone[] } => {
  const byId = new Map<string, T>();
  const tombstoneById = new Map<string, Tombstone>();

  for (const record of [...localRecords, ...remoteRecords]) {
    byId.set(record.id, pickLatest(byId.get(record.id), record, signature));
  }

  for (const tombstone of [...localTombstones, ...remoteTombstones]) {
    tombstoneById.set(tombstone.id, pickLatestTombstone(tombstoneById.get(tombstone.id), tombstone));
  }

  const records: T[] = [];
  const tombstones: Tombstone[] = [];

  for (const id of new Set([...byId.keys(), ...tombstoneById.keys()])) {
    const record = byId.get(id);
    const tombstone = tombstoneById.get(id);

    if (record == null) {
      if (tombstone != null) tombstones.push(tombstone);
      continue;
    }

    // Strictly greater: a deletion in the same millisecond as an edit wins,
    // because the delete is the later intent.
    if (tombstone == null || recordClock(record) > tombstoneClock(tombstone)) {
      records.push(record);
    } else {
      tombstones.push(tombstone);
    }
  }

  return { records, tombstones: tombstones.sort(compareTombstonesByDeletedDesc) };
};

/** Favourites sort most-used first, then most recently used. */
export const compareFavourites = (a: Favourite, b: Favourite): number => {
  if (b.useCount !== a.useCount) return b.useCount - a.useCount;
  const left = a.lastUsedAt ?? '';
  const right = b.lastUsedAt ?? '';
  if (left !== right) return right.localeCompare(left);
  return a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
};

/**
 * Merge two ledgers into the state both devices should agree on.
 *
 * Commutative and idempotent: merge(a, b) === merge(b, a), and merging a state
 * with itself is a no-op. Both properties are covered by tests, because a merge
 * that lacks them corrupts data slowly and invisibly.
 */
export const mergeLedgers = (local: LedgerState, remote: LedgerState): LedgerState => {
  const entries = mergeCollection(
    local.entries,
    remote.entries,
    local.tombstones,
    remote.tombstones,
    entrySignature
  );

  const favourites = mergeCollection(
    local.favourites,
    remote.favourites,
    local.favouriteTombstones,
    remote.favouriteTombstones,
    favouriteSignature
  );

  return {
    entries: entries.records.sort(compareByDateDesc),
    tombstones: entries.tombstones,
    favourites: favourites.records.sort(compareFavourites),
    favouriteTombstones: favourites.tombstones
  };
};

/** Order-independent signature of a whole ledger. */
export const ledgerSignature = (state: LedgerState): string =>
  JSON.stringify({
    entries: [...state.entries].sort((a, b) => a.id.localeCompare(b.id)).map(entrySignature),
    tombstones: [...state.tombstones]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((tombstone) => [tombstone.id, tombstone.deletedAt]),
    favourites: [...state.favourites]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(favouriteSignature),
    favouriteTombstones: [...state.favouriteTombstones]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((tombstone) => [tombstone.id, tombstone.deletedAt])
  });

/**
 * Used after a Drive write to confirm what landed matches what was sent, before
 * trusting the round trip.
 */
export const ledgersEqual = (left: LedgerState, right: LedgerState): boolean =>
  ledgerSignature(left) === ledgerSignature(right);
