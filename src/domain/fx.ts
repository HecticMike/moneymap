import { KEYS, dbGet, dbSet } from '../storage/db';
import { BASE_CURRENCY, type CurrencyCode } from './types';

/**
 * Exchange rates from frankfurter.app — ECB reference rates, free, no API key
 * and no signup, which matters for an app that must stay free forever.
 *
 * The rate is resolved once at capture and then frozen onto the entry. Nothing
 * here is ever consulted when *reading* an entry back.
 */

const API = 'https://api.frankfurter.app';

/** pair ("EUR>GBP") → day ("2026-07-14") → rate */
type RateCache = Record<string, Record<string, number>>;

export interface RateResolution {
  rate: number;
  /** The day the rate is actually for — not necessarily the day requested. */
  rateDate: string;
  /**
   * True when the rate is not for the requested day: a weekend or holiday (ECB
   * publishes on business days only), or an offline fallback to the nearest
   * cached day. Surfaced so an approximate entry can be re-rated later.
   */
  approximate: boolean;
}

const pairKey = (from: CurrencyCode, to: CurrencyCode): string => `${from}>${to}`;

export const dayOf = (isoDate: string): string => {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
};

/**
 * Closest cached rate to a target day, in days. Pure and tested: this is the
 * offline path, and getting it wrong means silently mis-valuing a holiday.
 */
export const pickNearestRate = (
  rates: Record<string, number> | undefined,
  targetDay: string
): { rate: number; rateDate: string } | null => {
  if (rates == null) return null;

  const exact = rates[targetDay];
  if (exact != null) return { rate: exact, rateDate: targetDay };

  const target = Date.parse(targetDay);
  if (Number.isNaN(target)) return null;

  let best: { rate: number; rateDate: string; distance: number } | null = null;
  for (const [day, rate] of Object.entries(rates)) {
    const parsed = Date.parse(day);
    if (Number.isNaN(parsed)) continue;
    const distance = Math.abs(parsed - target);
    // Ties resolve to the earlier day, so the result is deterministic.
    if (best == null || distance < best.distance) best = { rate, rateDate: day, distance };
  }

  return best == null ? null : { rate: best.rate, rateDate: best.rateDate };
};

const readCache = async (): Promise<RateCache> => (await dbGet<RateCache>(KEYS.fxRates)) ?? {};

const writeCache = async (pair: string, day: string, rate: number): Promise<void> => {
  const cache = await readCache();
  const existing = cache[pair] ?? {};
  await dbSet(KEYS.fxRates, { ...cache, [pair]: { ...existing, [day]: rate } });
};

const fetchRate = async (
  from: CurrencyCode,
  to: CurrencyCode,
  day: string
): Promise<{ rate: number; rateDate: string } | null> => {
  const today = new Date().toISOString().slice(0, 10);
  // Frankfurter has no future rates; asking for one returns an error, so a
  // forward-dated entry uses today's rate and is flagged approximate.
  const requested = day > today ? 'latest' : day;

  const response = await fetch(`${API}/${requested}?from=${from}&to=${to}`);
  if (!response.ok) return null;

  const data = (await response.json()) as { date?: string; rates?: Record<string, number> };
  const rate = data.rates?.[to];
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return null;

  return { rate, rateDate: data.date ?? day };
};

/**
 * Resolve the rate to use for an entry.
 *
 * Returns null only when the currency differs from base *and* there is no
 * network and nothing cached — in which case the caller must not invent a rate.
 * Capture never blocks on this: the UI offers to save at a rate the person
 * confirms, rather than guessing silently.
 */
export const resolveRate = async (
  currency: CurrencyCode,
  isoDate: string
): Promise<RateResolution | null> => {
  if (currency === BASE_CURRENCY) {
    return { rate: 1, rateDate: dayOf(isoDate), approximate: false };
  }

  const day = dayOf(isoDate);
  const pair = pairKey(currency, BASE_CURRENCY);
  const cache = await readCache();

  const cachedExact = cache[pair]?.[day];
  if (cachedExact != null) return { rate: cachedExact, rateDate: day, approximate: false };

  try {
    const fetched = await fetchRate(currency, BASE_CURRENCY, day);
    if (fetched != null) {
      await writeCache(pair, fetched.rateDate, fetched.rate);
      // Also key it under the requested day so a weekend lookup hits next time.
      if (fetched.rateDate !== day) await writeCache(pair, day, fetched.rate);
      return {
        rate: fetched.rate,
        rateDate: fetched.rateDate,
        approximate: fetched.rateDate !== day
      };
    }
  } catch {
    /* Offline. Fall through to the cache. */
  }

  const nearest = pickNearestRate(cache[pair], day);
  if (nearest != null) {
    return { rate: nearest.rate, rateDate: nearest.rateDate, approximate: true };
  }

  return null;
};

/** Warm the cache so a trip abroad can capture offline. */
export const prefetchTodayRate = async (currency: CurrencyCode): Promise<void> => {
  if (currency === BASE_CURRENCY) return;
  try {
    await resolveRate(currency, new Date().toISOString());
  } catch {
    /* Best effort. */
  }
};
