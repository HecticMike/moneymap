import type { CategoryId } from './categories';
import { parseAmount } from './money';
import { guessCategory, type CategoryGuess } from './suggestions';

/**
 * Free-text capture: "12.50 tesco", "45 fuel yesterday", "coffee 3,40".
 *
 * Everything it extracts is shown back before saving. The parser is allowed to
 * be wrong; it is never allowed to be wrong *silently*, which is why each part
 * is returned separately with what it matched on rather than as a finished
 * entry.
 */

export interface ParsedEntryText {
  amount: number | null;
  /** yyyy-mm-dd, or null when the text said nothing about a date. */
  date: string | null;
  /** How the date was written, for echoing back ("yesterday", "Mon 8 Sep"). */
  dateLabel: string | null;
  category: CategoryGuess | null;
  /** What is left once the amount and date are removed. */
  note: string;
}

const DAY_NAMES = [
  ['sunday', 'sun'],
  ['monday', 'mon'],
  ['tuesday', 'tue', 'tues'],
  ['wednesday', 'wed'],
  ['thursday', 'thu', 'thur', 'thurs'],
  ['friday', 'fri'],
  ['saturday', 'sat']
] as const;

const MONTHS = [
  ['january', 'jan'], ['february', 'feb'], ['march', 'mar'], ['april', 'apr'],
  ['may'], ['june', 'jun'], ['july', 'jul'], ['august', 'aug'],
  ['september', 'sep', 'sept'], ['october', 'oct'], ['november', 'nov'], ['december', 'dec']
] as const;

const toDay = (date: Date): string => {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = local.getTimezoneOffset() * 60_000;
  return new Date(local.getTime() - offset).toISOString().slice(0, 10);
};

const shiftDays = (from: Date, days: number): Date => {
  const next = new Date(from);
  next.setDate(next.getDate() + days);
  return next;
};

/** How far ahead a bare day/month is taken at face value before being read as last year. */
const FUTURE_TOLERANCE_MS = 31 * 24 * 60 * 60 * 1000;

interface DateMatch {
  date: string;
  label: string;
  /** Portion of the input consumed, to strip before reading the amount. */
  consumed: string;
}

const matchDate = (text: string, now: Date): DateMatch | null => {
  const lowered = text.toLowerCase();

  if (/\btoday\b/.test(lowered)) {
    return { date: toDay(now), label: 'today', consumed: 'today' };
  }
  if (/\byesterday\b/.test(lowered)) {
    return { date: toDay(shiftDays(now, -1)), label: 'yesterday', consumed: 'yesterday' };
  }

  // "12 sep" / "sep 12" / "12 september"
  for (let month = 0; month < MONTHS.length; month += 1) {
    for (const name of MONTHS[month] ?? []) {
      const dayThenMonth = new RegExp(`\\b(\\d{1,2})\\s+${name}\\b`).exec(lowered);
      const monthThenDay = new RegExp(`\\b${name}\\s+(\\d{1,2})\\b`).exec(lowered);
      const hit = dayThenMonth ?? monthThenDay;
      if (hit?.[1] == null) continue;

      const day = Number(hit[1]);
      if (day < 1 || day > 31) continue;

      let candidate = new Date(now.getFullYear(), month, day);
      // Well into the future means last year ("25 dec" typed in September is
      // last Christmas). A few days ahead is left alone — that is a near-term
      // entry or a typo, and silently shifting it a whole year is worse than
      // taking it at face value.
      if (candidate.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
        candidate = new Date(now.getFullYear() - 1, month, day);
      }
      return { date: toDay(candidate), label: hit[0], consumed: hit[0] };
    }
  }

  // "12/09" or "12-09" — day first, as written in the UK and Portugal.
  const numeric = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/.exec(lowered);
  if (numeric?.[1] != null && numeric[2] != null) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]) - 1;
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      const yearPart = numeric[3];
      let year = now.getFullYear();
      if (yearPart != null) year = yearPart.length === 2 ? 2000 + Number(yearPart) : Number(yearPart);

      let candidate = new Date(year, month, day);
      if (yearPart == null && candidate.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
        candidate = new Date(year - 1, month, day);
      }
      return { date: toDay(candidate), label: numeric[0], consumed: numeric[0] };
    }
  }

  // Day names mean the most recent one, today included.
  for (let index = 0; index < DAY_NAMES.length; index += 1) {
    for (const name of DAY_NAMES[index] ?? []) {
      if (!new RegExp(`\\b${name}\\b`).test(lowered)) continue;
      const diff = (now.getDay() - index + 7) % 7;
      const candidate = shiftDays(now, -diff);
      return { date: toDay(candidate), label: name, consumed: name };
    }
  }

  return null;
};

const AMOUNT_TOKEN = /^[£€$]?\d[\d.,]*$/;

export interface ParseOptions {
  now?: Date;
  /** Note-word → category associations learned from this household's entries. */
  learned?: Map<string, CategoryId>;
}

export const parseEntryText = (raw: string, options: ParseOptions = {}): ParsedEntryText => {
  const now = options.now ?? new Date();
  const text = raw.trim();

  if (text === '') {
    return { amount: null, date: null, dateLabel: null, category: null, note: '' };
  }

  // Date first, so "12 sep" does not have its day read as the amount.
  const dateMatch = matchDate(text, now);
  const withoutDate =
    dateMatch == null
      ? text
      : text.replace(new RegExp(dateMatch.consumed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ');

  let amount: number | null = null;
  const remaining: string[] = [];

  for (const token of withoutDate.split(/\s+/)) {
    if (token === '') continue;
    if (amount == null && AMOUNT_TOKEN.test(token)) {
      const value = parseAmount(token);
      if (value != null && value > 0) {
        amount = value;
        continue;
      }
    }
    remaining.push(token);
  }

  const note = remaining.join(' ').replace(/\s+/g, ' ').trim();
  const category = note === '' ? null : guessCategory(note, options.learned);

  return {
    amount,
    date: dateMatch?.date ?? null,
    dateLabel: dateMatch?.label ?? null,
    category,
    note
  };
};
