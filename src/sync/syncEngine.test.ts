import { describe, expect, it } from 'vitest';
import { backoffDelayMs, shouldSync, syncOnce, type RemoteStore } from './syncEngine';
import type { Entry, LedgerState } from '../domain/types';

const entry = (id: string, over: Partial<Entry> = {}): Entry => ({
  id,
  amount: 10,
  currency: 'GBP',
  rateToBase: 1,
  rateDate: null,
  baseAmount: 10,
  category: 'living_home_supermarket',
  date: '2026-01-15T00:00:00.000Z',
  note: id,
  user: null,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
  source: 'form',
  ...over
});

const ledger = (ids: string[]): LedgerState => ({
  entries: ids.map((id) => entry(id)),
  tombstones: []
});

const idsOf = (state: LedgerState): string[] => state.entries.map((item) => item.id).sort();

/** Stand-in for Drive, able to simulate the other phone writing mid-sync. */
class FakeDrive implements RemoteStore {
  state: LedgerState = { entries: [], tombstones: [] };
  exists = false;
  syncedAt: string | null = null;
  reads = 0;
  writes = 0;
  /** Runs before a given read, to inject a concurrent change. */
  interfereBeforeRead = new Map<number, (drive: FakeDrive) => void>();

  read = async () => {
    this.reads += 1;
    this.interfereBeforeRead.get(this.reads)?.(this);
    return {
      state: { entries: [...this.state.entries], tombstones: [...this.state.tombstones] },
      syncedAt: this.syncedAt,
      exists: this.exists
    };
  };

  write = async (state: LedgerState, syncedAt: string) => {
    this.writes += 1;
    this.state = state;
    this.syncedAt = syncedAt;
    this.exists = true;
  };
}

const clock = () => {
  let tick = 0;
  return () => `2026-03-01T00:00:${String(tick++).padStart(2, '0')}.000Z`;
};

describe('syncOnce', () => {
  it('creates the backup when none exists yet', async () => {
    const drive = new FakeDrive();
    const result = await syncOnce(ledger(['a', 'b']), drive, { now: clock() });

    expect(result.action).toBe('pushed');
    expect(result.converged).toBe(true);
    expect(drive.writes).toBe(1);
    expect(idsOf(drive.state)).toEqual(['a', 'b']);
  });

  it('pulls the other phone\'s entries without writing anything back', async () => {
    const drive = new FakeDrive();
    drive.state = ledger(['remote-1', 'remote-2']);
    drive.exists = true;

    const result = await syncOnce({ entries: [], tombstones: [] }, drive, { now: clock() });

    expect(result.action).toBe('pulled');
    expect(idsOf(result.state)).toEqual(['remote-1', 'remote-2']);
    expect(drive.writes).toBe(0);
  });

  it('does nothing at all when both sides already agree', async () => {
    // This is the common case — opening the app with no changes. It must cost
    // one read and zero writes, or every cold start burns a Drive revision.
    const drive = new FakeDrive();
    drive.state = ledger(['a', 'b']);
    drive.exists = true;

    const result = await syncOnce(ledger(['a', 'b']), drive, { now: clock() });

    expect(result.action).toBe('already-in-sync');
    expect(drive.writes).toBe(0);
    expect(drive.reads).toBe(1);
  });

  it('unions both sides when each has entries the other lacks', async () => {
    const drive = new FakeDrive();
    drive.state = ledger(['remote']);
    drive.exists = true;

    const result = await syncOnce(ledger(['local']), drive, { now: clock() });

    expect(result.converged).toBe(true);
    expect(idsOf(result.state)).toEqual(['local', 'remote']);
    expect(idsOf(drive.state)).toEqual(['local', 'remote']);
  });

  it('recovers when the other phone writes in the gap between write and verify', async () => {
    const drive = new FakeDrive();
    drive.state = ledger(['remote']);
    drive.exists = true;

    // Read 1 = initial. Write 1 lands. Read 2 = verify — just before it, the
    // other phone overwrites with something that does not contain our push.
    drive.interfereBeforeRead.set(2, (d) => {
      d.state = ledger(['remote', 'from-other-phone']);
    });

    const result = await syncOnce(ledger(['local']), drive, { now: clock() });

    expect(result.action).toBe('pushed-after-conflict');
    expect(result.converged).toBe(true);
    expect(result.attempts).toBe(2);
    // Nothing dropped on either side.
    expect(idsOf(result.state)).toEqual(['from-other-phone', 'local', 'remote']);
    expect(idsOf(drive.state)).toEqual(['from-other-phone', 'local', 'remote']);
  });

  it('keeps every local entry even when it never manages to converge', async () => {
    // The property that matters most: a device cannot lose data by syncing,
    // however badly the network behaves.
    const drive = new FakeDrive();
    drive.state = ledger(['remote']);
    drive.exists = true;

    // Something overwrites Drive before every single verify read.
    for (let read = 2; read <= 12; read += 2) {
      drive.interfereBeforeRead.set(read, (d) => {
        d.state = ledger([`interloper-${read}`]);
      });
    }

    const result = await syncOnce(ledger(['local']), drive, { now: clock() });

    expect(result.action).toBe('gave-up');
    expect(result.converged).toBe(false);
    expect(result.attempts).toBe(3);
    expect(idsOf(result.state)).toContain('local');
    expect(idsOf(result.state)).toContain('remote');
  });

  it('honours a custom attempt limit', async () => {
    const drive = new FakeDrive();
    drive.exists = true;
    for (let read = 1; read <= 20; read += 1) {
      drive.interfereBeforeRead.set(read, (d) => {
        d.state = ledger([`churn-${read}`]);
      });
    }

    const result = await syncOnce(ledger(['local']), drive, { maxAttempts: 5, now: clock() });
    expect(result.attempts).toBe(5);
  });

  it('propagates a deletion rather than resurrecting the entry', async () => {
    const drive = new FakeDrive();
    drive.state = ledger(['a', 'b']);
    drive.exists = true;

    const localAfterDelete: LedgerState = {
      entries: [entry('a')],
      tombstones: [{ id: 'b', deletedAt: '2026-02-01T00:00:00.000Z' }]
    };

    const result = await syncOnce(localAfterDelete, drive, { now: clock() });

    expect(idsOf(result.state)).toEqual(['a']);
    expect(idsOf(drive.state)).toEqual(['a']);
    expect(drive.state.tombstones.map((t) => t.id)).toEqual(['b']);
  });
});

describe('shouldSync', () => {
  const base = {
    online: true,
    authenticated: true,
    syncing: false,
    dirty: false,
    lastAttemptAt: null,
    now: 1_000_000
  };

  it('refuses when offline, signed out, or already running', () => {
    expect(shouldSync({ ...base, online: false })).toBe(false);
    expect(shouldSync({ ...base, authenticated: false })).toBe(false);
    expect(shouldSync({ ...base, syncing: true })).toBe(false);
  });

  it('always syncs when there are unsaved local changes', () => {
    expect(shouldSync({ ...base, dirty: true, lastAttemptAt: base.now - 10 })).toBe(true);
  });

  it('throttles idle polling', () => {
    expect(shouldSync({ ...base, lastAttemptAt: base.now - 60_000 })).toBe(false);
    expect(shouldSync({ ...base, lastAttemptAt: base.now - 6 * 60_000 })).toBe(true);
  });

  it('syncs on first run', () => {
    expect(shouldSync(base)).toBe(true);
  });
});

describe('backoffDelayMs', () => {
  it('grows exponentially and then stops', () => {
    expect(backoffDelayMs(0)).toBe(0);
    expect(backoffDelayMs(1)).toBe(30_000);
    expect(backoffDelayMs(2)).toBe(60_000);
    expect(backoffDelayMs(3)).toBe(120_000);
    expect(backoffDelayMs(50)).toBe(15 * 60 * 1000);
  });
});
