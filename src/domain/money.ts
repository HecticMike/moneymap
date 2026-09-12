import { BASE_CURRENCY, type CurrencyCode } from './types';

export interface CurrencyMeta {
  code: CurrencyCode;
  label: string;
  symbol: string;
  locale: string;
}

export const CURRENCY_META: Record<CurrencyCode, CurrencyMeta> = {
  GBP: { code: 'GBP', label: 'British Pound', symbol: '£', locale: 'en-GB' },
  EUR: { code: 'EUR', label: 'Euro', symbol: '€', locale: 'en-IE' }
};

export const CURRENCY_CODES = Object.keys(CURRENCY_META) as CurrencyCode[];

export const isCurrencyCode = (value: unknown): value is CurrencyCode =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(CURRENCY_META, value);

/**
 * Round to 2dp, correcting for binary float representation first.
 *
 * `Math.round(1.005 * 100) / 100` gives 1.00, because 1.005 is really
 * 1.00499999999999989 in float64. The 1e-9 nudge pushes values that are a hair
 * under a rounding boundary back onto it. It is safe because no real monetary
 * input carries meaningful precision anywhere near 1e-9.
 *
 * Amounts are stored as 2dp decimals rather than integer minor units so the
 * Drive JSON backup stays readable when opened by hand. Every write goes
 * through here, so stored values are always already rounded; accumulated error
 * across a sum of a few thousand entries lands around 1e-12, far below the
 * penny this rounds to.
 */
export const roundMoney = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const nudge = value >= 0 ? 1e-9 : -1e-9;
  return Math.round((value + nudge) * 100) / 100;
};

/** `amount` in `currency` expressed in BASE_CURRENCY. Rounded once, then frozen. */
export const toBaseAmount = (amount: number, rateToBase: number): number =>
  roundMoney(amount * rateToBase);

const formatterCache = new Map<string, Intl.NumberFormat>();

const formatterFor = (currency: CurrencyCode): Intl.NumberFormat => {
  const cached = formatterCache.get(currency);
  if (cached != null) return cached;
  const meta = CURRENCY_META[currency];
  const created = new Intl.NumberFormat(meta.locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  formatterCache.set(currency, created);
  return created;
};

export const formatMoney = (value: number, currency: CurrencyCode = BASE_CURRENCY): string =>
  formatterFor(currency).format(roundMoney(value));

/**
 * Parse whatever a person actually types into an amount.
 *
 * Handles "12.50", "12,50", "1,234.56", "1.234,56", "£12.50" and "€12". Shared
 * with the free-text capture parser, which is why it lives here and is tested
 * directly rather than being buried in a form handler.
 *
 * Ambiguity rule: when a single separator is followed by exactly three digits
 * it is read as thousands grouping ("1,234" and "1.234" both mean 1234).
 * Anything else is read as a decimal point. Money is never quoted to 3dp, so
 * this resolves the real cases correctly.
 */
export const parseAmount = (raw: string): number | null => {
  if (typeof raw !== 'string') return null;

  const cleaned = raw.replace(/[^\d.,-]/g, '');
  if (cleaned === '' || cleaned === '-') return null;

  const negative = cleaned.trimStart().startsWith('-');
  const digits = cleaned.replace(/-/g, '');
  if (digits === '') return null;

  const lastComma = digits.lastIndexOf(',');
  const lastDot = digits.lastIndexOf('.');
  const lastSeparator = Math.max(lastComma, lastDot);

  let normalised: string;
  if (lastSeparator === -1) {
    normalised = digits;
  } else {
    const decimalPlaces = digits.length - lastSeparator - 1;
    const onlyOneKindOfSeparator = lastComma === -1 || lastDot === -1;
    const isThousandsGrouping = decimalPlaces === 3 && onlyOneKindOfSeparator;

    normalised = isThousandsGrouping
      ? digits.replace(/[.,]/g, '')
      : `${digits.slice(0, lastSeparator).replace(/[.,]/g, '')}.${digits.slice(lastSeparator + 1)}`;
  }

  const value = Number(normalised);
  if (!Number.isFinite(value)) return null;

  return roundMoney(negative ? -value : value);
};
