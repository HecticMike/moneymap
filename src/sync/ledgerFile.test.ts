import { describe, expect, it } from 'vitest';
import { parseLedgerFile, serialiseLedgerFile } from './ledgerFile';

/** A payload shaped exactly like the one money-map v1 writes to Drive. */
const v1Payload = {
  expenses: [
    {
      id: 'e1',
      amount: 45.2,
      category: 'living_home_supermarket',
      date: '2026-01-15T00:00:00.000Z',
      note: 'Tesco',
      createdAt: '2026-01-15T18:30:00.000Z',
      updatedAt: '2026-01-15T18:30:00.000Z',
      user: 'Miguel'
    },
    {
      id: 'e2',
      amount: 2400,
      category: 'income_salary',
      date: '2026-01-28T00:00:00.000Z',
      note: '',
      createdAt: '2026-01-28T09:00:00.000Z',
      updatedAt: '2026-01-28T09:00:00.000Z',
      user: 'Ines'
    }
  ],
  tombstones: [{ id: 'e0', deletedAt: '2026-01-10T12:00:00.000Z' }],
  syncedAt: '2026-01-29T08:00:00.000Z',
  version: 2
};

describe('importing money-map v1', () => {
  it('detects the v1 schema', () => {
    expect(parseLedgerFile(v1Payload).report.detected).toBe('v1');
  });

  it('imports every entry without loss', () => {
    const { state, report } = parseLedgerFile(v1Payload);
    expect(report.read).toBe(2);
    expect(report.imported).toBe(2);
    expect(report.skipped).toBe(0);
    expect(state.entries).toHaveLength(2);
    expect(state.tombstones).toHaveLength(1);
  });

  it('tags v1 entries as base currency at rate 1 without guessing', () => {
    // v1 stored no currency at all. Inferring which past entries were Portugal
    // trips would quietly rewrite real history, so everything lands as GBP and
    // re-tagging is left as a deliberate action in the app.
    const { state } = parseLedgerFile(v1Payload);
    for (const entry of state.entries) {
      expect(entry.currency).toBe('GBP');
      expect(entry.rateToBase).toBe(1);
      expect(entry.rateDate).toBeNull();
      expect(entry.baseAmount).toBe(entry.amount);
    }
  });

  it('preserves ids, amounts, notes and people exactly', () => {
    const { state } = parseLedgerFile(v1Payload);
    const tesco = state.entries.find((entry) => entry.id === 'e1');
    expect(tesco).toBeDefined();
    expect(tesco!.amount).toBe(45.2);
    expect(tesco!.note).toBe('Tesco');
    expect(tesco!.user).toBe('Miguel');
    expect(tesco!.category).toBe('living_home_supermarket');
  });

  it('marks imported entries as such', () => {
    const { state } = parseLedgerFile(v1Payload);
    expect(state.entries.every((entry) => entry.source === 'import')).toBe(true);
  });

  it('orders by transaction date, most recent first', () => {
    const { state } = parseLedgerFile(v1Payload);
    expect(state.entries.map((entry) => entry.id)).toEqual(['e2', 'e1']);
  });
});

describe('importing damaged data', () => {
  it('backfills missing timestamps from the transaction date', () => {
    const { state, report } = parseLedgerFile({
      expenses: [
        { id: 'x', amount: 10, category: 'other', date: '2026-01-15T00:00:00.000Z', note: '' }
      ]
    });
    expect(report.timestampsBackfilled).toBe(1);
    expect(state.entries[0]!.createdAt).toBe('2026-01-15T00:00:00.000Z');
    expect(state.entries[0]!.updatedAt).toBe('2026-01-15T00:00:00.000Z');
  });

  it('maps an unknown category to Other rather than dropping the entry', () => {
    const { state, report } = parseLedgerFile({
      expenses: [
        { id: 'x', amount: 10, category: 'category_that_no_longer_exists', date: '2026-01-15' }
      ]
    });
    expect(report.imported).toBe(1);
    expect(report.categoriesCoerced).toBe(1);
    expect(state.entries[0]!.category).toBe('other');
  });

  it('skips entries with no usable amount or date, and says so', () => {
    const { report } = parseLedgerFile({
      expenses: [
        { id: 'ok', amount: 10, date: '2026-01-15', category: 'other' },
        { id: 'no-amount', amount: 'abc', date: '2026-01-15', category: 'other' },
        { id: 'no-date', amount: 10, date: 'whenever', category: 'other' }
      ]
    });
    expect(report.imported).toBe(1);
    expect(report.skipped).toBe(2);
    expect(report.warnings).toHaveLength(2);
  });

  it('gives a duplicate id a fresh one so it cannot shadow a real entry', () => {
    const { state, report } = parseLedgerFile({
      expenses: [
        { id: 'dup', amount: 10, date: '2026-01-15', category: 'other', note: 'first' },
        { id: 'dup', amount: 20, date: '2026-01-16', category: 'other', note: 'second' }
      ]
    });
    expect(report.imported).toBe(2);
    expect(new Set(state.entries.map((entry) => entry.id)).size).toBe(2);
  });

  it('never throws on junk, and never reports junk as an empty ledger', () => {
    // This matters: "parsed fine, zero entries" would let a corrupt read
    // overwrite a perfectly good remote backup with nothing.
    for (const junk of [null, undefined, 42, 'nope', [], {}, { expenses: 'not-an-array' }]) {
      const result = parseLedgerFile(junk);
      expect(result.state.entries).toHaveLength(0);
      expect(result.report.warnings.length).toBeGreaterThan(0);
      expect(result.report.detected).toBe('unknown');
    }
  });

  it('drops malformed tombstones without failing the import', () => {
    const { state, report } = parseLedgerFile({
      expenses: [],
      tombstones: [{ id: 'good', deletedAt: '2026-01-10T12:00:00.000Z' }, { id: 'bad' }, null, 'x']
    });
    expect(state.tombstones).toHaveLength(1);
    expect(report.detected).toBe('v1');
  });
});

describe('our own file format', () => {
  it('round-trips without drift', () => {
    const original = parseLedgerFile(v1Payload).state;
    const written = serialiseLedgerFile(original, '2026-02-01T00:00:00.000Z');
    const reread = parseLedgerFile(JSON.parse(JSON.stringify(written)));

    expect(reread.report.detected).toBe('v3');
    expect(reread.report.skipped).toBe(0);
    expect(reread.state).toEqual(original);
    expect(reread.syncedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('carries both people\'s favourites through a round trip', () => {
    const favourites = [
      {
        id: 'f1',
        label: 'Tesco',
        person: 'Miguel',
        category: 'living_home_supermarket',
        currency: 'GBP',
        amount: null,
        note: 'Tesco',
        useCount: 4,
        lastUsedAt: '2026-09-10T10:00:00.000Z',
        createdAt: '2026-08-01T10:00:00.000Z',
        updatedAt: '2026-09-10T10:00:00.000Z'
      },
      {
        id: 'f2',
        label: 'Pingo Doce',
        person: 'Ines',
        category: 'living_home_supermarket',
        currency: 'EUR',
        amount: 40,
        note: 'Pingo Doce',
        useCount: 2,
        lastUsedAt: null,
        createdAt: '2026-08-02T10:00:00.000Z',
        updatedAt: '2026-08-02T10:00:00.000Z'
      }
    ];

    const written = { app: 'moneymap', schema: 4, entries: [], tombstones: [], favourites, favouriteTombstones: [], syncedAt: '2026-09-12T00:00:00.000Z' };
    const result = parseLedgerFile(written);

    expect(result.report.favourites).toBe(2);
    expect(result.state.favourites.map((f) => f.person).sort()).toEqual(['Ines', 'Miguel']);
    expect(result.state.favourites.find((f) => f.id === 'f2')?.currency).toBe('EUR');
    expect(result.state.favourites.find((f) => f.id === 'f2')?.amount).toBe(40);

    const again = parseLedgerFile(JSON.parse(JSON.stringify(serialiseLedgerFile(result.state, 'x'))));
    expect(again.state.favourites).toEqual(result.state.favourites);
  });

  it('reads a schema-3 file as simply having no favourites', () => {
    // Backwards compatibility: favourites arrived in schema 4, and an older
    // backup having none is the correct outcome rather than an error.
    const result = parseLedgerFile({ app: 'moneymap', schema: 3, entries: [], tombstones: [] });
    expect(result.report.detected).toBe('v3');
    expect(result.state.favourites).toEqual([]);
    expect(result.report.warnings).toHaveLength(0);
  });

  it('migrates a favourite stored under the older "user" field', () => {
    const result = parseLedgerFile({
      entries: [],
      favourites: [{ id: 'f1', label: 'Tesco', user: 'Miguel', category: 'living_home_supermarket' }]
    });
    expect(result.state.favourites[0]!.person).toBe('Miguel');
    // Backfilled, so it has a valid merge clock instead of losing every
    // conflict forever by sitting at the epoch.
    expect(result.state.favourites[0]!.createdAt).not.toBe('');
    expect(result.state.favourites[0]!.updatedAt).toBe(result.state.favourites[0]!.createdAt);
  });

  it('keeps a null favourite amount null, rather than reading it as zero', () => {
    // Regression: `Number(null)` is 0, not NaN. A favourite with no fixed
    // amount was coming back as £0.00 and rendering as if it cost nothing.
    const result = parseLedgerFile({
      entries: [],
      favourites: [
        { id: 'f1', label: 'Tesco', category: 'living_home_supermarket', amount: null },
        { id: 'f2', label: 'Rent', category: 'living_home_rent', amount: 1250 }
      ]
    });
    expect(result.state.favourites.find((f) => f.id === 'f1')?.amount).toBeNull();
    expect(result.state.favourites.find((f) => f.id === 'f2')?.amount).toBe(1250);
  });

  it('refuses an entry whose amount is explicitly null', () => {
    // The same coercion bug would have zeroed a real entry out of every total.
    const result = parseLedgerFile({
      expenses: [{ id: 'x', amount: null, date: '2026-01-15', category: 'other' }]
    });
    expect(result.report.imported).toBe(0);
    expect(result.report.skipped).toBe(1);
  });

  it('drops unusable favourites without failing the whole read', () => {
    const result = parseLedgerFile({
      entries: [],
      favourites: [
        { id: 'ok', label: 'Fine', category: 'living_home_rent' },
        { id: 'no-category', label: 'Broken' },
        { label: 'No id', category: 'living_home_rent' },
        null,
        'nonsense'
      ]
    });
    expect(result.state.favourites.map((f) => f.id)).toEqual(['ok']);
  });

  it('preserves a foreign-currency entry and its frozen rate', () => {
    const written = {
      app: 'moneymap',
      schema: 3,
      entries: [
        {
          id: 'lisbon',
          amount: 50,
          currency: 'EUR',
          rateToBase: 0.8534,
          rateDate: '2026-07-14T00:00:00.000Z',
          baseAmount: 42.67,
          category: 'leisure_lifestyle_eating_out',
          date: '2026-07-14T00:00:00.000Z',
          note: 'Dinner',
          user: 'Miguel',
          createdAt: '2026-07-14T20:00:00.000Z',
          updatedAt: '2026-07-14T20:00:00.000Z',
          source: 'form'
        }
      ],
      tombstones: [],
      syncedAt: '2026-07-15T00:00:00.000Z'
    };

    const entry = parseLedgerFile(written).state.entries[0]!;
    expect(entry.currency).toBe('EUR');
    expect(entry.amount).toBe(50);
    expect(entry.rateToBase).toBe(0.8534);
    // Frozen, not recomputed — this is the whole point of storing it.
    expect(entry.baseAmount).toBe(42.67);
    expect(entry.source).toBe('form');
  });
});
