import type { LedgerState } from '../domain/types';
import { ledgersEqual, mergeLedgers } from './merge';

/**
 * Sync orchestration, with the network kept behind an interface so the whole
 * algorithm — including the concurrent-write cases — can be tested without
 * touching Google.
 *
 * The safety property that makes this sound: **local state is only ever merged
 * into, never replaced.** A device cannot lose an entry by syncing, because
 * anything it knows survives every merge. The worst a failed sync can do is
 * delay propagation to the other phone, which the next sync corrects.
 *
 * Drive has no compare-and-swap, so concurrent writes are handled the way v1
 * did it — write, read back, re-merge and retry if the read-back does not
 * match. That loop is only actually correct if the merge is commutative and
 * idempotent, which v1's was not (see merge.ts). It is now, and it is tested.
 */

export interface RemoteSnapshot {
  state: LedgerState;
  syncedAt: string | null;
  /** False when no backup file exists remotely yet. */
  exists: boolean;
}

export interface RemoteStore {
  read: () => Promise<RemoteSnapshot>;
  write: (state: LedgerState, syncedAt: string) => Promise<void>;
}

export type SyncAction =
  | 'already-in-sync'
  | 'pulled'
  | 'pushed'
  | 'pushed-after-conflict'
  | 'gave-up';

export interface SyncOutcome {
  /** The state the device should adopt. Always a superset of what it had. */
  state: LedgerState;
  action: SyncAction;
  attempts: number;
  /** True when remote and local are known to agree. */
  converged: boolean;
  syncedAt: string | null;
}

export interface SyncOptions {
  maxAttempts?: number;
  now?: () => string;
}

const DEFAULT_MAX_ATTEMPTS = 3;

export const syncOnce = async (
  local: LedgerState,
  remote: RemoteStore,
  options: SyncOptions = {}
): Promise<SyncOutcome> => {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const now = options.now ?? (() => new Date().toISOString());

  let working = local;
  let attempts = 0;
  let lastSyncedAt: string | null = null;
  let sawConflict = false;

  while (attempts < maxAttempts) {
    attempts += 1;

    const snapshot = await remote.read();
    const merged = mergeLedgers(working, snapshot.state);
    lastSyncedAt = snapshot.syncedAt;

    // Remote already holds everything this device knows. Writing would burn a
    // request and a Drive revision to change nothing — so on a cold app open
    // with no local changes, this costs exactly one read.
    if (snapshot.exists && ledgersEqual(merged, snapshot.state)) {
      return {
        state: merged,
        action: ledgersEqual(merged, local) ? 'already-in-sync' : 'pulled',
        attempts,
        converged: true,
        syncedAt: snapshot.syncedAt
      };
    }

    const syncedAt = now();
    await remote.write(merged, syncedAt);

    // Drive offers no atomic compare-and-swap, so confirm what actually landed
    // rather than assuming the write won.
    const verify = await remote.read();
    if (ledgersEqual(merged, verify.state)) {
      return {
        state: merged,
        action: sawConflict ? 'pushed-after-conflict' : 'pushed',
        attempts,
        converged: true,
        syncedAt: verify.syncedAt ?? syncedAt
      };
    }

    // The other phone wrote in the gap. Fold its version in and go again —
    // convergent because the merge is commutative and idempotent.
    sawConflict = true;
    working = mergeLedgers(merged, verify.state);
    lastSyncedAt = verify.syncedAt;
  }

  // Out of attempts. `working` still contains everything both sides knew, so
  // nothing is lost — it simply has not been confirmed onto Drive yet.
  return {
    state: working,
    action: 'gave-up',
    attempts,
    converged: false,
    syncedAt: lastSyncedAt
  };
};

/** Whether a sync is worth attempting at all. */
export const shouldSync = (input: {
  online: boolean;
  authenticated: boolean;
  syncing: boolean;
  dirty: boolean;
  lastAttemptAt: number | null;
  now: number;
  minIntervalMs?: number;
}): boolean => {
  if (!input.online || !input.authenticated || input.syncing) return false;
  // Pending local changes always justify a sync, however recent the last one.
  if (input.dirty) return true;
  if (input.lastAttemptAt == null) return true;
  return input.now - input.lastAttemptAt >= (input.minIntervalMs ?? 5 * 60 * 1000);
};

/**
 * Exponential backoff with a ceiling, so a Drive outage or a revoked token does
 * not turn into a request every four seconds for the rest of the day.
 */
export const backoffDelayMs = (consecutiveFailures: number): number => {
  if (consecutiveFailures <= 0) return 0;
  return Math.min(30_000 * 2 ** (consecutiveFailures - 1), 15 * 60 * 1000);
};
