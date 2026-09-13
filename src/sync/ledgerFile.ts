import { CATEGORY_META, isCategoryId, type CategoryId } from '../domain/categories';
import { isCurrencyCode, roundMoney, toBaseAmount } from '../domain/money';
import {
  BASE_CURRENCY,
  emptyLedger,
  type Entry,
  type EntrySource,
  type Favourite,
  type LedgerState,
  type Tombstone
} from '../domain/types';
import { compareByDateDesc, compareFavourites, compareTombstonesByDeletedDesc } from './merge';

/**
 * Reading and writing the Drive backup file.
 *
 * Two schemas are understood:
 *
 *   v1  `money-map-data.json`     — written by money-map v1, `{ expenses: [...] }`
 *   v3  `money-map-data-v3.json`  — written by this app,     `{ entries: [...] }`
 *
 * v1 is read-only. This app never writes to the old file, so the original app
 * keeps working untouched on both phones for as long as it stays installed.
 */

export const LEDGER_FILE_V1 = 'money-map-data.json';
export const LEDGER_FILE = 'money-map-data-v3.json';

/**
 * Schema 4 added favourites. The *file name* deliberately did not change: a
 * second file would leave the two phones reading different backups until both
 * happened to update, which is worse than a brief window where an older client
 * round-trips and drops the favourites array. Entries are never at risk either
 * way, and a lost favourite is re-addable in one tap.
 */
export const LEDGER_SCHEMA = 4;

export interface LedgerFile {
  app: 'moneymap';
  schema: typeof LEDGER_SCHEMA;
  entries: Entry[];
  tombstones: Tombstone[];
  favourites: Favourite[];
  favouriteTombstones: Tombstone[];
  syncedAt: string;
}

export interface ParseReport {
  detected: 'v1' | 'v3' | 'unknown';
  read: number;
  imported: number;
  skipped: number;
  /** Unrecognised category IDs remapped to `other` rather than dropped. */
  categoriesCoerced: number;
  /** Entries that arrived without createdAt/updatedAt and were backfilled. */
  timestampsBackfilled: number;
  tombstones: number;
  favourites: number;
  warnings: string[];
}

export interface ParseResult {
  state: LedgerState;
  syncedAt: string | null;
  report: ParseReport;
}

const emptyReport = (detected: ParseReport['detected']): ParseReport => ({
  detected,
  read: 0,
  imported: 0,
  skipped: 0,
  categoriesCoerced: 0,
  timestampsBackfilled: 0,
  tombstones: 0,
  favourites: 0,
  warnings: []
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Normalise anything date-shaped to an ISO string, or null if unusable. */
const toIso = (value: unknown): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const toFiniteNumber = (value: unknown): number | null => {
  // `Number(null)` is 0, not NaN. Without this guard an explicit null — which
  // for a favourite's amount means "ask every time" — silently reads as zero,
  // and on an entry would zero it out of every total in the app.
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toSource = (value: unknown): EntrySource => {
  const allowed: EntrySource[] = ['form', 'chip', 'template', 'text', 'import'];
  return typeof value === 'string' && (allowed as string[]).includes(value)
    ? (value as EntrySource)
    : 'import';
};

const newId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `mm-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

/**
 * Coerce one untrusted record into an Entry.
 *
 * Returns null only when the record is unusable (no amount, no usable date) —
 * the bar for dropping is deliberately high, because on the v1 import path this
 * is the household's only copy of its history.
 */
const readEntry = (raw: unknown, report: ParseReport): Entry | null => {
  if (!isRecord(raw)) {
    report.warnings.push('Skipped a record that was not an object.');
    return null;
  }

  const amount = toFiniteNumber(raw.amount);
  if (amount == null) {
    report.warnings.push(`Skipped entry ${String(raw.id ?? '(no id)')}: amount is not a number.`);
    return null;
  }

  const date = toIso(raw.date);
  if (date == null) {
    report.warnings.push(`Skipped entry ${String(raw.id ?? '(no id)')}: date is unreadable.`);
    return null;
  }

  let category: CategoryId = 'other';
  if (isCategoryId(raw.category)) {
    category = raw.category;
  } else {
    report.categoriesCoerced += 1;
    report.warnings.push(
      `Entry ${String(raw.id ?? '(no id)')}: unknown category "${String(raw.category)}" mapped to Other.`
    );
  }

  // v1 has no currency at all. Everything it holds is treated as GBP at rate 1
  // — no attempt is made to guess which past entries were Portugal trips,
  // because guessing would quietly rewrite real history. Re-tagging a date
  // range is a deliberate, visible action in the app instead.
  const currency = isCurrencyCode(raw.currency) ? raw.currency : BASE_CURRENCY;
  const rateToBase =
    currency === BASE_CURRENCY ? 1 : (toFiniteNumber(raw.rateToBase) ?? 1);
  const rateDate = currency === BASE_CURRENCY ? null : toIso(raw.rateDate);

  const storedBase = toFiniteNumber(raw.baseAmount);
  const roundedAmount = roundMoney(amount);

  // Backfilling these is what lets the merge clock ignore `date` entirely —
  // see the note in merge.ts on future-dated entries being undeletable.
  const hadTimestamps = toIso(raw.createdAt) != null && toIso(raw.updatedAt) != null;
  if (!hadTimestamps) report.timestampsBackfilled += 1;

  const createdAt = toIso(raw.createdAt) ?? date;
  const updatedAt = toIso(raw.updatedAt) ?? createdAt;

  return {
    id: typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : newId(),
    amount: roundedAmount,
    currency,
    rateToBase,
    rateDate,
    baseAmount: storedBase ?? toBaseAmount(roundedAmount, rateToBase),
    category,
    date,
    note: typeof raw.note === 'string' ? raw.note : '',
    user: typeof raw.user === 'string' && raw.user.length > 0 ? raw.user : null,
    createdAt,
    updatedAt,
    source: toSource(raw.source)
  };
};

/**
 * Coerce one untrusted record into a Favourite.
 *
 * Also migrates the shape slice 3 stored locally, which used `user` and had no
 * merge timestamps — those get backfilled so the record has a valid clock the
 * first time it syncs, rather than losing every conflict forever by sitting at
 * the epoch.
 */
const readFavourite = (raw: unknown, now: string): Favourite | null => {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== 'string' || raw.id === '') return null;
  if (!isCategoryId(raw.category)) return null;

  const amount = toFiniteNumber(raw.amount);
  const person =
    typeof raw.person === 'string' && raw.person !== ''
      ? raw.person
      : typeof raw.user === 'string' && raw.user !== ''
        ? raw.user
        : null;

  const createdAt = toIso(raw.createdAt) ?? now;

  return {
    id: raw.id,
    label:
      typeof raw.label === 'string' && raw.label.trim() !== ''
        ? raw.label.trim()
        : CATEGORY_META[raw.category].label,
    person,
    category: raw.category,
    currency: isCurrencyCode(raw.currency) ? raw.currency : BASE_CURRENCY,
    amount: amount == null ? null : roundMoney(amount),
    note: typeof raw.note === 'string' ? raw.note : '',
    useCount: typeof raw.useCount === 'number' && Number.isFinite(raw.useCount) ? raw.useCount : 0,
    lastUsedAt: toIso(raw.lastUsedAt),
    createdAt,
    updatedAt: toIso(raw.updatedAt) ?? createdAt
  };
};

const readTombstone = (raw: unknown): Tombstone | null => {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== 'string' || raw.id.length === 0) return null;
  const deletedAt = toIso(raw.deletedAt);
  return deletedAt == null ? null : { id: raw.id, deletedAt };
};

/**
 * Parse a Drive backup, whichever schema it is in.
 *
 * Never throws on malformed content: a corrupt or half-written file returns an
 * empty ledger plus warnings, so a bad read can never be mistaken for "the
 * household has no expenses" and overwrite a good remote copy.
 */
export const parseLedgerFile = (raw: unknown): ParseResult => {
  if (!isRecord(raw)) {
    const report = emptyReport('unknown');
    report.warnings.push('Backup file is not a JSON object.');
    return { state: emptyLedger(), syncedAt: null, report };
  }

  const rawEntries = Array.isArray(raw.entries)
    ? raw.entries
    : Array.isArray(raw.expenses)
      ? raw.expenses
      : null;

  const detected: ParseReport['detected'] = Array.isArray(raw.entries)
    ? 'v3'
    : Array.isArray(raw.expenses)
      ? 'v1'
      : 'unknown';

  const report = emptyReport(detected);

  if (rawEntries == null) {
    report.warnings.push('Backup file has neither an "entries" nor an "expenses" array.');
    return { state: emptyLedger(), syncedAt: toIso(raw.syncedAt), report };
  }

  report.read = rawEntries.length;

  const entries: Entry[] = [];
  const seen = new Set<string>();

  for (const candidate of rawEntries) {
    const entry = readEntry(candidate, report);
    if (entry == null) {
      report.skipped += 1;
      continue;
    }
    // A duplicate id would silently shadow a real entry during merge.
    if (seen.has(entry.id)) {
      report.warnings.push(`Entry ${entry.id}: duplicate id, second copy given a fresh id.`);
      entry.id = newId();
    }
    seen.add(entry.id);
    entries.push(entry);
  }

  report.imported = entries.length;

  const tombstones: Tombstone[] = [];
  if (Array.isArray(raw.tombstones)) {
    for (const candidate of raw.tombstones) {
      const tombstone = readTombstone(candidate);
      if (tombstone != null) tombstones.push(tombstone);
    }
  }
  report.tombstones = tombstones.length;

  // Favourites arrived in schema 4. A schema-3 file simply has none, which is
  // the correct outcome rather than an error.
  const now = new Date().toISOString();
  const favourites: Favourite[] = [];
  const seenFavourites = new Set<string>();
  if (Array.isArray(raw.favourites)) {
    for (const candidate of raw.favourites) {
      const favourite = readFavourite(candidate, now);
      if (favourite == null || seenFavourites.has(favourite.id)) continue;
      seenFavourites.add(favourite.id);
      favourites.push(favourite);
    }
  }
  report.favourites = favourites.length;

  const favouriteTombstones: Tombstone[] = [];
  if (Array.isArray(raw.favouriteTombstones)) {
    for (const candidate of raw.favouriteTombstones) {
      const tombstone = readTombstone(candidate);
      if (tombstone != null) favouriteTombstones.push(tombstone);
    }
  }

  return {
    state: {
      entries: entries.sort(compareByDateDesc),
      tombstones: tombstones.sort(compareTombstonesByDeletedDesc),
      favourites: favourites.sort(compareFavourites),
      favouriteTombstones: favouriteTombstones.sort(compareTombstonesByDeletedDesc)
    },
    syncedAt: toIso(raw.syncedAt),
    report
  };
};

export const serialiseLedgerFile = (state: LedgerState, syncedAt: string): LedgerFile => ({
  app: 'moneymap',
  schema: LEDGER_SCHEMA,
  entries: state.entries,
  tombstones: state.tombstones,
  favourites: state.favourites,
  favouriteTombstones: state.favouriteTombstones,
  syncedAt
});
