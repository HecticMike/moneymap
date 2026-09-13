/**
 * Turning dictated text into something the entry parser can read.
 *
 * iOS dictation writes numbers as words — "forty five pounds fuel yesterday" —
 * and British speech puts the pence after the currency: "twelve pounds fifty".
 * Neither form reaches `parseAmount`, which wants digits. This normalises the
 * words to digits first and leaves everything else exactly as spoken, so the
 * existing category and date parsing keeps working unchanged.
 */

const UNITS: Record<string, number> = {
  zero: 0, oh: 0, nought: 0,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19
};

const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90
};

const SCALES: Record<string, number> = { hundred: 100, thousand: 1000 };

/** Words dictation inserts that carry no value inside an amount. */
const CURRENCY_WORDS = new Set([
  'pound', 'pounds', 'quid', 'euro', 'euros', 'pence', 'pennies', 'cent', 'cents', 'p'
]);

const isNumberWord = (token: string): boolean =>
  token in UNITS || token in TENS || token in SCALES;

interface Run {
  value: number;
  /** Index of the first token after the run. */
  next: number;
  /** True when the run already carries a fractional part. */
  hasDecimal: boolean;
}

/** Read a plain integer run: "forty five", "one hundred and five", "two thousand". */
const readInteger = (tokens: string[], start: number): { value: number; next: number } | null => {
  let index = start;
  let total = 0;
  let current = 0;
  let seen = false;

  while (index < tokens.length) {
    const token = tokens[index]!;

    // "a hundred" / "a thousand" — only when a scale actually follows.
    if ((token === 'a' || token === 'an') && tokens[index + 1] != null && tokens[index + 1]! in SCALES) {
      current = current === 0 ? 1 : current;
      index += 1;
      continue;
    }

    // "and" only glues when it sits between number words.
    if (token === 'and' && seen && tokens[index + 1] != null && isNumberWord(tokens[index + 1]!)) {
      index += 1;
      continue;
    }

    if (token in UNITS) {
      current += UNITS[token]!;
      seen = true;
      index += 1;
      continue;
    }

    if (token in TENS) {
      current += TENS[token]!;
      seen = true;
      index += 1;
      continue;
    }

    if (token in SCALES) {
      const scale = SCALES[token]!;
      if (scale === 100) {
        current = (current === 0 ? 1 : current) * 100;
      } else {
        total += (current === 0 ? 1 : current) * scale;
        current = 0;
      }
      seen = true;
      index += 1;
      continue;
    }

    break;
  }

  return seen ? { value: total + current, next: index } : null;
};

/** Digits spoken one at a time after "point": "point five zero" → .50 */
const readPointDigits = (tokens: string[], start: number): { digits: string; next: number } => {
  let index = start;
  let digits = '';

  while (index < tokens.length) {
    const token = tokens[index]!;
    if (token in UNITS && UNITS[token]! <= 9) {
      digits += String(UNITS[token]);
      index += 1;
      continue;
    }
    if (/^\d+$/.test(token)) {
      digits += token;
      index += 1;
      continue;
    }
    break;
  }

  return { digits, next: index };
};

const readRun = (tokens: string[], start: number): Run | null => {
  // A bare digit string can still pick up a spoken fractional part
  // ("12 pounds 50"), so digits enter the run machinery too.
  const first = tokens[start]!;
  let whole: { value: number; next: number } | null = null;

  if (/^\d+$/.test(first)) {
    whole = { value: Number(first), next: start + 1 };
  } else {
    whole = readInteger(tokens, start);
  }

  if (whole == null) return null;

  let index = whole.next;
  let value = whole.value;
  let hasDecimal = false;

  // "point five zero"
  if (tokens[index] === 'point') {
    const { digits, next } = readPointDigits(tokens, index + 1);
    if (digits !== '') {
      value = Number(`${whole.value}.${digits}`);
      hasDecimal = true;
      index = next;
    }
  }

  // "twelve pounds fifty" / "twelve pounds fifty pence" — the British habit of
  // putting the pence after the unit, which no digit parser would catch.
  if (!hasDecimal && tokens[index] != null && CURRENCY_WORDS.has(tokens[index]!)) {
    const after = index + 1;
    const fraction =
      tokens[after] != null && /^\d+$/.test(tokens[after]!)
        ? { value: Number(tokens[after]!), next: after + 1 }
        : readInteger(tokens, after);

    if (fraction != null && fraction.value > 0 && fraction.value < 100) {
      let next = fraction.next;
      // Swallow a trailing "pence"/"p" so it does not land in the note.
      if (tokens[next] != null && CURRENCY_WORDS.has(tokens[next]!)) next += 1;

      value = Number(`${whole.value}.${String(fraction.value).padStart(2, '0')}`);
      hasDecimal = true;
      index = next;
    } else {
      // Just a unit with nothing after it: drop the word, keep the number.
      index += 1;
    }
  } else if (tokens[index] != null && CURRENCY_WORDS.has(tokens[index]!)) {
    index += 1;
  }

  return { value, next: index, hasDecimal };
};

/**
 * Rewrite spoken numbers as digits, leaving every other word untouched.
 *
 * Safe to run over text that was typed rather than dictated: with no number
 * words present it returns the input unchanged.
 */
export const normaliseSpokenAmount = (raw: string): string => {
  if (typeof raw !== 'string' || raw.trim() === '') return raw;

  const tokens = raw.trim().toLowerCase().split(/\s+/);
  const out: string[] = [];
  let index = 0;
  let amountTaken = false;

  while (index < tokens.length) {
    const token = tokens[index]!;

    // Only the first number in the sentence is treated as the amount; later
    // ones stay as spoken so "table for two" cannot become the price.
    if (!amountTaken && (isNumberWord(token) || /^\d+$/.test(token) || token === 'a' || token === 'an')) {
      const run = readRun(tokens, index);
      if (run != null) {
        out.push(run.hasDecimal ? run.value.toFixed(2) : String(run.value));
        amountTaken = true;
        index = run.next;
        continue;
      }
    }

    out.push(token);
    index += 1;
  }

  return out.join(' ');
};
