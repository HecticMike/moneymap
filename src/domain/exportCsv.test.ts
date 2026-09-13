import { describe, expect, it } from 'vitest';
import { CSV_COLUMNS, csvFilename, toCsv } from './exportCsv';
import type { CategoryId } from './categories';
import type { Entry } from './types';

const NOW = new Date(2026, 8, 13, 12, 0, 0);

let counter = 0;
const entry = (over: Partial<Entry> & { category: CategoryId }): Entry => {
  const date = new Date(2026, 8, 4, 12, 0, 0).toISOString();
  return {
    id: `e${counter++}`,
    amount: 45.2,
    currency: 'GBP',
    rateToBase: 1,
    rateDate: null,
    baseAmount: 45.2,
    date,
    note: '',
    user: 'Miguel',
    createdAt: date,
    updatedAt: date,
    source: 'form',
    ...over
  };
};

const rows = (csv: string) => csv.trimEnd().split('\r\n');
const cells = (row: string) => row.split(',');

describe('toCsv', () => {
  it('writes a header naming every column', () => {
    const csv = toCsv([]);
    expect(rows(csv)[0]).toBe(`﻿${CSV_COLUMNS.join(',')}`);
  });

  it('starts with a byte order mark so Excel reads pounds and accents', () => {
    // Without it, "£" and "Inês" arrive as mojibake in Excel on Windows.
    expect(toCsv([])).toMatch(/^﻿/);
  });

  it('keeps the note in its own column', () => {
    // The whole point: a spreadsheet can then filter Tesco against Waitrose,
    // which the app's own categories cannot distinguish.
    const csv = toCsv([entry({ category: 'living_home_supermarket', note: 'Tesco' })]);
    const noteIndex = CSV_COLUMNS.indexOf('Note');
    expect(cells(rows(csv)[1]!)[noteIndex]).toBe('Tesco');
  });

  it('carries the committed split out with the data', () => {
    const rent = [1, 2, 3, 4].map((month) =>
      entry({
        category: 'living_home_rent',
        amount: 1250,
        baseAmount: 1250,
        date: new Date(2026, month, 1, 12, 0, 0).toISOString()
      })
    );
    const dinner = entry({
      category: 'leisure_lifestyle_eating_out',
      note: 'Dinner',
      date: new Date(2026, 8, 6, 12, 0, 0).toISOString()
    });

    const csv = toCsv([...rent, dinner], { now: new Date(2026, 4, 10) });
    const committedIndex = CSV_COLUMNS.indexOf('Committed');

    const byNote = new Map(
      rows(csv)
        .slice(1)
        .map((row) => [cells(row)[CSV_COLUMNS.indexOf('Note')], cells(row)[committedIndex]])
    );

    expect(byNote.get('Dinner')).toBe('No');
    expect([...byNote.values()]).toContain('Yes');
  });

  it('records both the entered amount and the pounds figure', () => {
    const csv = toCsv([
      entry({
        category: 'leisure_lifestyle_eating_out',
        amount: 50,
        currency: 'EUR',
        rateToBase: 0.8534,
        baseAmount: 42.67,
        note: 'Lisbon'
      })
    ]);
    const row = cells(rows(csv)[1]!);

    expect(row[CSV_COLUMNS.indexOf('Amount')]).toBe('50');
    expect(row[CSV_COLUMNS.indexOf('Currency')]).toBe('EUR');
    expect(row[CSV_COLUMNS.indexOf('Rate to GBP')]).toBe('0.8534');
    expect(row[CSV_COLUMNS.indexOf('Amount (GBP)')]).toBe('42.67');
  });

  it('writes dates that sort correctly as text', () => {
    const csv = toCsv([entry({ category: 'other' })]);
    expect(cells(rows(csv)[1]!)[0]).toBe('2026-09-04');
  });

  it('puts the newest entry first', () => {
    const older = entry({ category: 'other', note: 'older', date: new Date(2026, 7, 1, 12).toISOString() });
    const newer = entry({ category: 'other', note: 'newer', date: new Date(2026, 8, 1, 12).toISOString() });

    const noteIndex = CSV_COLUMNS.indexOf('Note');
    const order = rows(toCsv([older, newer])).slice(1).map((row) => cells(row)[noteIndex]);
    expect(order).toEqual(['newer', 'older']);
  });

  it('quotes a note containing a comma, a quote or a newline', () => {
    const csv = toCsv([
      entry({ category: 'other', note: 'Tesco, then Boots' }),
      entry({ category: 'other', note: 'She said "fine"' })
    ]);

    expect(csv).toContain('"Tesco, then Boots"');
    expect(csv).toContain('"She said ""fine"""');
  });

  it('stops a note being executed as a formula', () => {
    // A note is free text somebody typed. Excel runs a cell starting with "="
    // as a formula, and =HYPERLINK or =cmd payloads are a real exfiltration
    // route out of an innocuous-looking spreadsheet.
    const csv = toCsv([
      entry({ category: 'other', note: '=1+1' }),
      entry({ category: 'other', note: '@SUM(A1:A9)' }),
      entry({ category: 'other', note: '-2+3' })
    ]);

    expect(csv).not.toMatch(/,=1\+1/);
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'@SUM(A1:A9)");
    expect(csv).toContain("'-2+3");
  });

  it('leaves an empty note and an unassigned person blank rather than "null"', () => {
    const csv = toCsv([entry({ category: 'other', note: '', user: null })]);
    const row = cells(rows(csv)[1]!);
    expect(row[CSV_COLUMNS.indexOf('Note')]).toBe('');
    expect(row[CSV_COLUMNS.indexOf('Person')]).toBe('');
  });

  it('produces only a header for an empty ledger', () => {
    expect(rows(toCsv([]))).toHaveLength(1);
  });
});

describe('csvFilename', () => {
  it('is dated, so successive exports do not overwrite each other', () => {
    expect(csvFilename(NOW)).toBe('money-map-2026-09-13.csv');
  });
});
