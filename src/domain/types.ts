import type { CategoryId } from './categories';

/** Currencies the app can capture in. Base is what everything reports in. */
export type CurrencyCode = 'GBP' | 'EUR';

/** UK household, Portugal trips. Everything rolls up to GBP. */
export const BASE_CURRENCY: CurrencyCode = 'GBP';

/**
 * How an entry got created. Recorded so the capture surfaces can be ranked by
 * what is actually used, rather than by guesswork (see slice 3).
 */
export type EntrySource = 'form' | 'chip' | 'template' | 'text' | 'import';

export interface Entry {
  id: string;

  /**
   * Money, as typed by the person, in `currency`. Always at most 2dp — see
   * `roundMoney`. Kept as a decimal rather than integer minor units so the
   * Drive JSON backup stays readable by a human opening the file.
   */
  amount: number;
  currency: CurrencyCode;

  /**
   * Multiplier from `currency` to BASE_CURRENCY, frozen at capture time and
   * never recomputed. This is the whole reason the currency work happens in
   * the foundation slice: a July trip to Lisbon must still read the same in
   * December, rather than silently re-valuing itself every time rates move.
   */
  rateToBase: number;

  /**
   * Which day's rate `rateToBase` came from. `null` when no conversion was
   * needed (currency === base). When this does not match `date`, the rate is
   * an offline fallback and the entry can be re-rated later.
   */
  rateDate: string | null;

  /** `amount * rateToBase`, rounded once and frozen. Never recompute on read. */
  baseAmount: number;

  category: CategoryId;
  /** ISO timestamp of when the money moved (not when it was typed). */
  date: string;
  note: string;
  /** Free-form so the household is not hardcoded into the schema. */
  user: string | null;

  createdAt: string;
  updatedAt: string;
  source: EntrySource;
}

/**
 * A deletion that has to survive a merge. Without these, deleting on one phone
 * and then syncing from the other resurrects the entry.
 */
export interface Tombstone {
  id: string;
  deletedAt: string;
}

/**
 * Anything that syncs. `createdAt`/`updatedAt` are the merge clock; `id` is
 * what a tombstone refers to.
 */
export interface Syncable {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A saved favourite — an entry the household repeats.
 *
 * `person` does double duty on purpose: it is whose favourites list this
 * appears in *and* who an entry created from it is attributed to. That is what
 * lets one phone log the other person's spending using their own shortcuts.
 * `null` means a shared household favourite, like rent.
 */
export interface Favourite extends Syncable {
  label: string;
  person: string | null;
  category: string;
  currency: CurrencyCode;
  /** null means "ask every time", which is the normal case. */
  amount: number | null;
  note: string;
  useCount: number;
  lastUsedAt: string | null;
}

/** The complete syncable state. This is what gets merged and what Drive holds. */
export interface LedgerState {
  entries: Entry[];
  tombstones: Tombstone[];
  favourites: Favourite[];
  favouriteTombstones: Tombstone[];
}

export const emptyLedger = (): LedgerState => ({
  entries: [],
  tombstones: [],
  favourites: [],
  favouriteTombstones: []
});
