import { useCallback, useEffect, useRef, useState } from 'react';
import type { LedgerState } from '../domain/types';
import { KEYS, dbGet, dbSet } from '../storage/db';
import { AuthError, googleAuth, type AuthSnapshot } from '../sync/googleAuth';
import { DriveError, createDriveRemote, readLegacyBackup } from '../sync/driveClient';
import { backoffDelayMs, syncOnce, type SyncAction } from '../sync/syncEngine';
import type { ParseReport } from '../sync/ledgerFile';

export type SyncStatus =
  | 'disabled'
  | 'signed-out'
  | 'idle'
  | 'syncing'
  | 'offline'
  | 'needs-reconnect'
  | 'error';

interface DriveMeta {
  fileId: string | null;
  lastSyncedAt: string | null;
}

/** Wait after the last edit before syncing, so typing five entries is one write. */
const DEBOUNCE_MS = 4_000;
/** Idle poll, to pick up the other phone's entries while the app sits open. */
const POLL_MS = 5 * 60_000;

interface UseSyncInput {
  ledger: LedgerState;
  revision: number;
  dirty: boolean;
  loaded: boolean;
  mergeIn: (state: LedgerState) => void;
  markSynced: (revision: number) => void;
}

export const useSync = ({ ledger, revision, dirty, loaded, mergeIn, markSynced }: UseSyncInput) => {
  const [auth, setAuth] = useState<AuthSnapshot>(() => googleAuth.snapshot());
  const [status, setStatus] = useState<SyncStatus>(
    googleAuth.configured ? 'signed-out' : 'disabled'
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<SyncAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  // Refs so the sync routine always reads current values without being
  // recreated — and therefore without restarting its timers — on every edit.
  const ledgerRef = useRef(ledger);
  const revisionRef = useRef(revision);
  const runningRef = useRef(false);
  const fileIdRef = useRef<string | null>(null);
  const failuresRef = useRef(0);
  const blockedUntilRef = useRef(0);

  ledgerRef.current = ledger;
  revisionRef.current = revision;

  useEffect(() => googleAuth.subscribe(setAuth), []);

  useEffect(() => {
    void dbGet<DriveMeta>(KEYS.driveMeta).then((meta) => {
      if (meta == null) return;
      fileIdRef.current = meta.fileId;
      setLastSyncedAt(meta.lastSyncedAt);
    });
  }, []);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const persistMeta = useCallback(async (syncedAt: string | null) => {
    await dbSet<DriveMeta>(KEYS.driveMeta, { fileId: fileIdRef.current, lastSyncedAt: syncedAt });
  }, []);

  const runSync = useCallback(
    async ({ interactive = false }: { interactive?: boolean } = {}) => {
      if (!googleAuth.configured) {
        setStatus('disabled');
        return;
      }
      if (runningRef.current) return;
      if (!navigator.onLine) {
        setStatus('offline');
        return;
      }
      // Respect backoff, unless the person explicitly asked.
      if (!interactive && Date.now() < blockedUntilRef.current) return;

      runningRef.current = true;
      setStatus('syncing');
      setError(null);

      const revisionAtStart = revisionRef.current;

      try {
        // Acquire up front so a missing token surfaces as "reconnect" rather
        // than as a mid-sync failure.
        await googleAuth.getToken({ interactive });

        const remote = createDriveRemote({
          getToken: (options) => googleAuth.getToken(options),
          fileId: fileIdRef.current,
          onFileId: (id) => {
            fileIdRef.current = id;
          }
        });

        const outcome = await syncOnce(ledgerRef.current, remote);

        mergeIn(outcome.state);
        if (outcome.converged) markSynced(revisionAtStart);

        setLastSyncedAt(outcome.syncedAt);
        setLastAction(outcome.action);
        setStatus('idle');
        failuresRef.current = 0;
        blockedUntilRef.current = 0;
        await persistMeta(outcome.syncedAt);
      } catch (cause) {
        failuresRef.current += 1;
        blockedUntilRef.current = Date.now() + backoffDelayMs(failuresRef.current);

        if (cause instanceof DriveError && cause.authExpired) {
          googleAuth.invalidate();
          setStatus('needs-reconnect');
          setError('Google Drive access expired. Tap Reconnect to continue syncing.');
        } else if (cause instanceof AuthError) {
          // A blocked popup on an automatic attempt is the expected outcome,
          // not a failure worth shouting about.
          setStatus(auth.everGranted ? 'needs-reconnect' : 'signed-out');
          setError(interactive ? cause.message : null);
        } else if (cause instanceof DriveError && cause.status === 0) {
          setStatus('offline');
        } else {
          setStatus('error');
          setError(cause instanceof Error ? cause.message : 'Sync failed.');
        }
      } finally {
        runningRef.current = false;
      }
    },
    [auth.everGranted, markSynced, mergeIn, persistMeta]
  );

  /** Explicit user action — allowed to prompt, and clears any backoff. */
  const connect = useCallback(async () => {
    failuresRef.current = 0;
    blockedUntilRef.current = 0;
    await runSync({ interactive: true });
  }, [runSync]);

  const disconnect = useCallback(() => {
    googleAuth.signOut();
    setStatus('signed-out');
    setError(null);
  }, []);

  // On open: try to pick the grant back up without a prompt. If the popup is
  // blocked (the common case with no user gesture), this lands on
  // 'needs-reconnect' and the UI shows a single tap to resume.
  useEffect(() => {
    if (!loaded) return;
    if (!googleAuth.configured) return;
    if (!auth.everGranted) return;
    void runSync({ interactive: false });
    // Deliberately once per mount, not on every auth change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // After edits settle.
  useEffect(() => {
    if (!dirty || !online || !auth.everGranted) return;
    const timer = setTimeout(() => void runSync(), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [dirty, revision, online, auth.everGranted, runSync]);

  // On regaining connectivity.
  useEffect(() => {
    if (!online || !auth.everGranted) return;
    void runSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  // On returning to the foreground — the main way the other phone's entries
  // arrive, since an installed PWA is usually resumed rather than reloaded.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && auth.everGranted) void runSync();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [auth.everGranted, runSync]);

  // Idle poll while the app stays open.
  useEffect(() => {
    if (!auth.everGranted) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void runSync();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [auth.everGranted, runSync]);

  /**
   * One-time import of the money-map v1 backup straight from Drive.
   * Read-only against the v1 file.
   */
  const importFromV1 = useCallback(async (): Promise<ParseReport | null> => {
    const token = await googleAuth.getToken({ interactive: true });
    const parsed = await readLegacyBackup(token);
    if (parsed == null) return null;
    mergeIn(parsed.state);
    await dbSet(KEYS.importState, { importedAt: new Date().toISOString(), report: parsed.report });
    void runSync();
    return parsed.report;
  }, [mergeIn, runSync]);

  return {
    status,
    auth,
    online,
    error,
    lastSyncedAt,
    lastAction,
    dirty,
    connect,
    disconnect,
    syncNow: () => runSync({ interactive: true }),
    importFromV1
  };
};
