import { CATEGORY_META, GROUP_META, groupOf, isIncome, type CategoryId } from './categories';
import { committedKeys, isCommittedEntry } from './choices';
import { BASE_CURRENCY, type Entry } from './types';

/**
 * Exporting the ledger for analysis in a spreadsheet.
 *
 * **CSV, not .xlsx.** v1 used SheetJS, whose npm distribution carries known
 * prototype-pollution and ReDoS advisories, and it pulled ~400KB into an app
 * whose entire bundle is smaller than that. CSV needs no dependency at all,
 * opens straight into Excel and Numbers, and is still readable in ten years —
 * which matters more for a household's own financial history than formatting.
 */

/** Excel and Numbers both need the BOM to read £ and accented names as UTF-8. */
const BOM = '﻿';

/**
 * A cell beginning `=`, `+`, `-` or `@` is executed as a formula when the file
 * is opened. A note is free text a person typed, so it must never be able to
 * become one — the leading apostrophe makes Excel treat it as literal text.
 */
const neutralise = (value: string): string =>
  /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

const cell = (value: string | number | null | undefined): string => {
  if (value == null) return '';
  if (typeof value === 'number') return String(value);

  const safe = neutralise(value);
  // Quote anything containing a delimiter, quote or newline; double inner quotes.
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** yyyy-mm-dd sorts correctly as text and is unambiguous across locales. */
const isoDay = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return new Date(local.getTime() - local.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

export const CSV_COLUMNS = [
  'Date',
  'Category',
  'Group',
  'Type',
  'Committed',
  'Person',
  'Note',
  'Amount',
  'Currency',
  'Rate to GBP',
  `Amount (${BASE_CURRENCY})`,
  'Entry ID'
] as const;

export interface ExportOptions {
  now?: Date;
}

/**
 * One row per entry, newest first.
 *
 * `Note` is deliberately its own column and never merged into the category, so
 * a spreadsheet can filter on it — comparing one supermarket against another,
 * which the app's own categories cannot answer.
 *
 * `Committed` carries the chosen-versus-owed split out with the data, so the
 * same distinction the app makes is available to a pivot table rather than
 * having to be reconstructed by hand.
 */
export const toCsv = (entries: Entry[], options: ExportOptions = {}): string => {
  const keys = committedKeys(entries, options.now);

  const rows = [...entries]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map((entry) => {
      const category = entry.category as CategoryId;
      const meta = CATEGORY_META[category];

      return [
        cell(isoDay(entry.date)),
        cell(meta.label),
        cell(GROUP_META[groupOf(category)].label),
        cell(isIncome(category) ? 'Income' : 'Expense'),
        cell(isCommittedEntry(entry, keys) ? 'Yes' : 'No'),
        cell(entry.user),
        cell(entry.note),
        cell(entry.amount),
        cell(entry.currency),
        cell(entry.rateToBase),
        cell(entry.baseAmount),
        cell(entry.id)
      ].join(',');
    });

  // CRLF: what Excel expects, and harmless everywhere else.
  return BOM + [CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n';
};

export const csvFilename = (now: Date = new Date()): string =>
  `money-map-${now.toISOString().slice(0, 10)}.csv`;
