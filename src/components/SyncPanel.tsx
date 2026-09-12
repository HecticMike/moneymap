import { formatDistanceToNow } from 'date-fns';
import type { SyncStatus } from '../hooks/useSync';

interface SyncPanelProps {
  status: SyncStatus;
  online: boolean;
  dirty: boolean;
  error: string | null;
  lastSyncedAt: string | null;
  everGranted: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onSyncNow: () => void;
  onImportV1: () => void;
  importing: boolean;
}

const TONE: Record<SyncStatus, string> = {
  disabled: 'text-brand-neutral',
  'signed-out': 'text-brand-neutral',
  idle: 'text-brand-positive',
  syncing: 'text-brand-neutral',
  offline: 'text-brand-neutral',
  'needs-reconnect': 'text-brand-highlight',
  error: 'text-brand-accent'
};

const LABEL: Record<SyncStatus, string> = {
  disabled: 'Not configured',
  'signed-out': 'Not connected',
  idle: 'Synced',
  syncing: 'Syncing…',
  offline: 'Offline',
  'needs-reconnect': 'Tap to resume',
  error: 'Needs attention'
};

export const SyncPanel: React.FC<SyncPanelProps> = ({
  status,
  online,
  dirty,
  error,
  lastSyncedAt,
  everGranted,
  onConnect,
  onDisconnect,
  onSyncNow,
  onImportV1,
  importing
}) => {
  const effective: SyncStatus = !online && status !== 'syncing' ? 'offline' : status;
  const button =
    'border border-brand-line px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] transition disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <section className="border border-brand-line bg-brand-ocean/80 px-4 py-5 shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-neutral">
          Google Drive
        </h2>
        <span
          className={`border border-brand-line bg-brand-midnight/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${TONE[effective]}`}
        >
          {LABEL[effective]}
          {dirty && effective !== 'syncing' ? ' · unsaved' : ''}
        </span>
      </div>

      {status === 'disabled' ? (
        <p className="mt-3 text-[11px] text-brand-neutral">
          Set <code className="border border-brand-line bg-brand-midnight px-1">VITE_GOOGLE_CLIENT_ID</code>{' '}
          to enable syncing.
        </p>
      ) : (
        <>
          <p className="mt-3 text-[11px] text-brand-neutral">
            {lastSyncedAt != null
              ? `Last synced ${formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}.`
              : 'No backup on Drive yet.'}{' '}
            Syncing happens on its own — when you open the app, a few seconds after an edit, and
            whenever you come back online.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {!everGranted ? (
              <button
                type="button"
                onClick={onConnect}
                className={`${button} bg-brand-highlight text-brand-midnight hover:bg-brand-amber`}
              >
                Connect Drive
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onSyncNow}
                  disabled={status === 'syncing'}
                  className={`${button} bg-brand-highlight text-brand-midnight hover:bg-brand-amber`}
                >
                  {status === 'needs-reconnect' ? 'Reconnect' : 'Sync now'}
                </button>
                <button
                  type="button"
                  onClick={onDisconnect}
                  className={`${button} text-brand-highlight hover:text-brand-amber`}
                >
                  Sign out
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onImportV1}
              disabled={importing}
              className={`${button} text-brand-highlight hover:text-brand-amber`}
            >
              {importing ? 'Importing…' : 'Import from old app'}
            </button>
          </div>

          {status === 'needs-reconnect' ? (
            <p className="mt-3 border border-brand-line bg-brand-midnight/70 px-3 py-2 text-[10px] text-brand-neutral">
              Google only lets a browser hold access for about an hour without a backend. One tap
              resumes it — no consent screen, and nothing is lost in the meantime.
            </p>
          ) : null}

          {error != null ? (
            <p className="mt-3 border border-brand-accent bg-brand-accent/10 px-3 py-2 text-[11px] text-brand-accent">
              {error}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
};
