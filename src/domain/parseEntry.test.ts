import { describe, expect, it } from 'vitest';
import { parseEntryText } from './parseEntry';
import type { CategoryId } from './categories';

// A Sunday, chosen so day-name handling is exercised at the week boundary.
const NOW = new Date(2026, 8, 13, 12, 0, 0);

const parse = (text: string, learned?: Map<string, CategoryId>) =>
  parseEntryText(text, learned == null ? { now: NOW } : { now: NOW, learned });

describe('amounts', () => {
  it('reads the amount and leaves the rest as the note', () => {
    const result = parse('12.50 tesco');
    expect(result.amount).toBe(12.5);
    expect(result.note).toBe('tesco');
  });

  it('does not care where the amount sits', () => {
    expect(parse('coffee 3.40').amount).toBe(3.4);
    expect(parse('coffee 3.40').note).toBe('coffee');
  });

  it('accepts a comma decimal and a currency symbol', () => {
    expect(parse('€45,20 jantar').amount).toBe(45.2);
    expect(parse('£8 lunch').amount).toBe(8);
  });

  it('takes only the first amount', () => {
    const result = parse('12.50 tesco 3.40');
    expect(result.amount).toBe(12.5);
    expect(result.note).toBe('tesco 3.40');
  });

  it('returns null when there is no amount', () => {
    expect(parse('tesco').amount).toBeNull();
    expect(parse('').amount).toBeNull();
  });
});

describe('dates', () => {
  it('understands today and yesterday', () => {
    expect(parse('12 lunch today').date).toBe('2026-09-13');
    expect(parse('12 lunch yesterday').date).toBe('2026-09-12');
  });

  it('strips the date word from the note', () => {
    const result = parse('45 fuel yesterday');
    expect(result.note).toBe('fuel');
    expect(result.dateLabel).toBe('yesterday');
  });

  it('reads "12 sep" without mistaking the day for the amount', () => {
    // The important case: date parsing must run first, or "12" is eaten as
    // the amount and the entry silently costs £12.
    const result = parse('45.20 tesco 12 sep');
    expect(result.date).toBe('2026-09-12');
    expect(result.amount).toBe(45.2);
    expect(result.note).toBe('tesco');
  });

  it('reads the month first too', () => {
    expect(parse('5 dinner sep 20').date).toBe('2026-09-20');
  });

  it('takes a date slightly ahead at face value, not as last year', () => {
    // "sep 20" typed on 13 Sep is a near-term entry or a typo. Silently
    // shifting it back a whole year would be far worse than accepting it.
    expect(parse('5 dinner sep 20').date).toBe('2026-09-20');
    // Three months ahead, though, is plainly last Christmas.
    expect(parse('30 gift 25 dec').date).toBe('2025-12-25');
  });

  it('reads a day/month number pair the British and Portuguese way round', () => {
    expect(parse('30 rent 01/09').date).toBe('2026-09-01');
  });

  it('assumes last year when the date would otherwise be in the future', () => {
    expect(parse('30 gift 25 dec').date).toBe('2025-12-25');
  });

  it('reads a day name as the most recent one', () => {
    // NOW is a Sunday, so Friday was two days ago.
    expect(parse('18 dinner friday').date).toBe('2026-09-11');
    expect(parse('18 dinner sunday').date).toBe('2026-09-13');
  });

  it('leaves the date null when nothing says otherwise', () => {
    expect(parse('12.50 tesco').date).toBeNull();
    expect(parse('12.50 tesco').dateLabel).toBeNull();
  });
});

describe('categories', () => {
  it('guesses from a known shop name', () => {
    expect(parse('45 tesco').category?.category).toBe('living_home_supermarket');
  });

  it('prefers what the household has actually done', () => {
    const learned = new Map<string, CategoryId>([['tesco', 'leisure_lifestyle_eating_out']]);
    const result = parse('45 tesco', learned);
    expect(result.category?.category).toBe('leisure_lifestyle_eating_out');
    expect(result.category?.via).toBe('learned');
  });

  it('leaves the category null when it cannot tell', () => {
    expect(parse('45 zzzz').category).toBeNull();
  });
});

describe('everything together', () => {
  it('handles the realistic cases', () => {
    const fuel = parse('62.40 petrol yesterday');
    expect(fuel.amount).toBe(62.4);
    expect(fuel.date).toBe('2026-09-12');
    expect(fuel.category?.category).toBe('mobility_transport_fuel');
    expect(fuel.note).toBe('petrol');

    const rent = parse('1250 rent 01/09');
    expect(rent.amount).toBe(1250);
    expect(rent.date).toBe('2026-09-01');
    expect(rent.category?.category).toBe('living_home_rent');
  });

  it('never throws on nonsense', () => {
    for (const junk of ['', '   ', '£', '...', '99999999999999', 'aaa bbb ccc']) {
      expect(() => parse(junk)).not.toThrow();
    }
  });

  it('degrades to a plain note when it understands nothing else', () => {
    const result = parse('something unusual');
    expect(result.amount).toBeNull();
    expect(result.date).toBeNull();
    expect(result.category).toBeNull();
    expect(result.note).toBe('something unusual');
  });
});
