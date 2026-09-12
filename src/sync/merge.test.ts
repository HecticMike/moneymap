import { describe, expect, it } from 'vitest';
import { compareByDateDesc, entryClock, ledgersEqual, mergeLedgers } from './merge';
import type { Entry, LedgerState, Tombstone } from '../domain/types';

const entry = (over: Partial<Entry> & { id: string }): Entry => ({
  amount: 10,
  currency: 'GBP',
  rateToBase: 1,
  rateDate: null,
  baseAmount: 10,
  category: 'living_home_supermarket',
  date: '2026-01-15T00:00:00.000Z',
  note: '',
  user: null,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
  source: 'form',
  ...over
});

const ledger = (entries: Entry[], tombstones: Tombstone[] = []): LedgerState => ({
  entries,
  tombstones
});

describe('algebraic properties', () => {
  // These two are the properties that matter. A merge lacking them corrupts
  // data slowly and invisibly, which is exactly what is hardest to notice.
  it('is commutative — both phones reach the same state regardless of who syncs first', () => {
    const phoneA = ledger(
      [
        entry({ id: 'a', updatedAt: '2026-02-01T10:00:00.000Z', note: 'from A' }),
        entry({ id: 'shared', updatedAt: '2026-02-03T10:00:00.000Z', note: 'A wins' })
      ],
      [{ id: 'gone-a', deletedAt: '2026-02-01T11:00:00.000Z' }]
    );
    const phoneB = ledger(
      [
        entry({ id: 'b', updatedAt: '2026-02-02T10:00:00.000Z', note: 'from B' }),
        entry({ id: 'shared', updatedAt: '2026-02-02T10:00:00.000Z', note: 'B loses' })
      ],
      [{ id: 'gone-b', deletedAt: '2026-02-02T11:00:00.000Z' }]
    );

    expect(ledgersEqual(mergeLedgers(phoneA, phoneB), mergeLedgers(phoneB, phoneA))).toBe(true);
  });

  it('is idempotent — re-syncing unchanged data changes nothing', () => {
    const state = ledger(
      [entry({ id: 'a' }), entry({ id: 'b', date: '2026-01-20T00:00:00.000Z' })],
      [{ id: 'c', deletedAt: '2026-01-18T00:00:00.000Z' }]
    );

    expect(ledgersEqual(mergeLedgers(state, state), state)).toBe(true);
    expect(ledgersEqual(mergeLedgers(mergeLedgers(state, state), state), state)).toBe(true);
  });

  it('breaks equal-clock ties identically in both directions', () => {
    // Same id, same timestamps, different content — the pathological case that
    // v1's `>=` comparison resolved as "whoever was visited second", leaving the
    // two phones permanently disagreeing.
    const left = ledger([entry({ id: 'x', note: 'left' })]);
    const right = ledger([entry({ id: 'x', note: 'right' })]);

    const forward = mergeLedgers(left, right);
    const backward = mergeLedgers(right, left);

    expect(forward.entries).toHaveLength(1);
    expect(ledgersEqual(forward, backward)).toBe(true);
  });
});

describe('last write wins', () => {
  it('keeps the more recently edited version of an entry', () => {
    const older = entry({ id: 'a', note: 'old', updatedAt: '2026-02-01T10:00:00.000Z' });
    const newer = entry({ id: 'a', note: 'new', updatedAt: '2026-02-05T10:00:00.000Z' });

    expect(mergeLedgers(ledger([older]), ledger([newer])).entries[0]!.note).toBe('new');
    expect(mergeLedgers(ledger([newer]), ledger([older])).entries[0]!.note).toBe('new');
  });

  it('unions entries that only exist on one side', () => {
    const merged = mergeLedgers(ledger([entry({ id: 'a' })]), ledger([entry({ id: 'b' })]));
    expect(merged.entries.map((item) => item.id).sort()).toEqual(['a', 'b']);
  });
});

describe('deletions', () => {
  it('does not resurrect an entry deleted on the other phone', () => {
    const stale = ledger([entry({ id: 'a', updatedAt: '2026-02-01T10:00:00.000Z' })]);
    const deleted = ledger([], [{ id: 'a', deletedAt: '2026-02-02T10:00:00.000Z' }]);

    const merged = mergeLedgers(stale, deleted);
    expect(merged.entries).toHaveLength(0);
    expect(merged.tombstones.map((item) => item.id)).toEqual(['a']);
  });

  it('lets a later edit undo an earlier deletion', () => {
    const deleted = ledger([], [{ id: 'a', deletedAt: '2026-02-01T10:00:00.000Z' }]);
    const edited = ledger([entry({ id: 'a', note: 'back', updatedAt: '2026-02-09T10:00:00.000Z' })]);

    const merged = mergeLedgers(deleted, edited);
    expect(merged.entries).toHaveLength(1);
    expect(merged.entries[0]!.note).toBe('back');
    expect(merged.tombstones).toHaveLength(0);
  });

  it('lets deletion win when an edit lands in the same millisecond', () => {
    const instant = '2026-02-01T10:00:00.000Z';
    const merged = mergeLedgers(
      ledger([entry({ id: 'a', updatedAt: instant })]),
      ledger([], [{ id: 'a', deletedAt: instant }])
    );
    expect(merged.entries).toHaveLength(0);
  });

  it('keeps tombstones for entries neither phone still holds', () => {
    const merged = mergeLedgers(
      ledger([], [{ id: 'ghost', deletedAt: '2026-01-01T00:00:00.000Z' }]),
      ledger([entry({ id: 'a' })])
    );
    expect(merged.tombstones.map((item) => item.id)).toEqual(['ghost']);
  });

  /**
   * Regression test for a real bug in money-map v1.
   *
   * v1's clock was `max(updatedAt, createdAt, date)`. `date` is the transaction
   * date and can be set in the future, so an entry dated next year carried a
   * next-year clock, outranked every subsequent deletion, and came back on the
   * next sync — permanently undeletable.
   */
  it('can delete a future-dated entry (v1 regression)', () => {
    const futureDated = entry({
      id: 'a',
      date: '2027-06-01T00:00:00.000Z',
      createdAt: '2026-01-10T10:00:00.000Z',
      updatedAt: '2026-01-10T10:00:00.000Z'
    });

    expect(entryClock(futureDated)).toBe(Date.parse('2026-01-10T10:00:00.000Z'));

    const merged = mergeLedgers(
      ledger([futureDated]),
      ledger([], [{ id: 'a', deletedAt: '2026-01-11T10:00:00.000Z' }])
    );

    expect(merged.entries).toHaveLength(0);
    expect(merged.tombstones.map((item) => item.id)).toEqual(['a']);
  });
});

describe('display ordering', () => {
  it('orders by transaction date, not by when the row was last edited', () => {
    const oldPurchaseEditedToday = entry({
      id: 'old',
      date: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z'
    });
    const recentPurchase = entry({
      id: 'recent',
      date: '2026-02-20T00:00:00.000Z',
      updatedAt: '2026-02-20T00:00:00.000Z'
    });

    const ordered = [oldPurchaseEditedToday, recentPurchase].sort(compareByDateDesc);
    expect(ordered.map((item) => item.id)).toEqual(['recent', 'old']);
  });

  it('orders identically on both phones when dates tie', () => {
    const a = entry({ id: 'aaa', date: '2026-02-20T00:00:00.000Z' });
    const b = entry({ id: 'bbb', date: '2026-02-20T00:00:00.000Z' });

    expect([a, b].sort(compareByDateDesc).map((i) => i.id)).toEqual(
      [b, a].sort(compareByDateDesc).map((i) => i.id)
    );
  });
});

describe('robustness', () => {
  it('treats unparseable timestamps as the epoch rather than NaN', () => {
    const broken = entry({ id: 'a', createdAt: 'not-a-date', updatedAt: 'also-not-a-date' });
    expect(entryClock(broken)).toBe(0);

    const merged = mergeLedgers(
      ledger([broken]),
      ledger([entry({ id: 'a', note: 'good', updatedAt: '2026-02-01T10:00:00.000Z' })])
    );
    expect(merged.entries[0]!.note).toBe('good');
  });

  it('handles empty ledgers on either side', () => {
    const state = ledger([entry({ id: 'a' })]);
    expect(mergeLedgers(state, ledger([])).entries).toHaveLength(1);
    expect(mergeLedgers(ledger([]), state).entries).toHaveLength(1);
    expect(mergeLedgers(ledger([]), ledger([])).entries).toHaveLength(0);
  });
});
