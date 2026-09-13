import { formatDistanceToNow } from 'date-fns';
import type { SyncStatus } from '../hooks/useSync';
import { Badge, Button, Card, Label } from './ui';

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

const PRESENTATION: Record<SyncStatus, { label: string; tone: 'neutral' | 'good' | 'warn' | 'bad' }> = {
  disabled: { label: 'Not configured', tone: 'neutral' },
  'signed-out': { label: 'Not connected', tone: 'neutral' },
  idle: { label: 'Synced', tone: 'good' },
  syncing: { label: 'Syncing', tone: 'neutral' },
  offline: { label: 'Offline', tone: 'neutral' },
  'needs-reconnect': { label: 'Tap to resume', tone: 'warn' },
  error: { label: 'Needs attention', tone: 'bad' }
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
  const { label, tone } = PRESENTATION[effective];

  return (
    <Card tight>
      <div className="flex items-center justify-between gap-3">
        <Label>Google Drive</Label>
        <div className="flex items-center gap-2">
          {dirty && effective !== 'syncing' ? <Badge>Unsaved</Badge> : null}
          <Badge tone={tone}>
            {effective === 'syncing' ? (
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-current"
                aria-hidden
              />
            ) : null}
            {label}
          </Badge>
        </div>
      </div>

      {status === 'disabled' ? (
        <p className="mt-2.5 text-caption text-ink-muted">
          Set <code className="rounded bg-surface-inset px-1.5 py-0.5 text-ink">VITE_GOOGLE_CLIENT_ID</code>{' '}
          to enable syncing.
        </p>
      ) : (
        <>
          <p className="mt-2.5 text-caption text-ink-muted">
            {lastSyncedAt != null
              ? `Last synced ${formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}.`
              : 'No backup on Drive yet.'}{' '}
            Syncing happens on its own — on open, after an edit, and when you come back online.
          </p>

          <div className="mt-3.5 flex flex-wrap gap-2">
            {!everGranted ? (
              <Button variant="primary" onClick={onConnect}>
                Connect Drive
              </Button>
            ) : (
              <>
                <Button
                  variant={status === 'needs-reconnect' ? 'primary' : 'outline'}
                  onClick={onSyncNow}
                  disabled={status === 'syncing'}
                >
                  {status === 'needs-reconnect' ? 'Reconnect' : 'Sync now'}
                </Button>
                <Button variant="quiet" onClick={onDisconnect}>
                  Sign out
                </Button>
              </>
            )}
            <Button variant="quiet" onClick={onImportV1} disabled={importing}>
              {importing ? 'Importing…' : 'Import from old app'}
            </Button>
          </div>

          {status === 'needs-reconnect' ? (
            <p className="mt-3 rounded-control bg-surface-inset/70 px-3.5 py-2.5 text-caption text-ink-muted">
              Google only lets a browser hold access for about an hour without a backend. One tap
              resumes it — no consent screen, and nothing is lost in the meantime.
            </p>
          ) : null}

          {error != null ? (
            <p className="mt-3 rounded-control border border-brand-accent/40 bg-brand-accent/10 px-3.5 py-2.5 text-caption text-brand-accent">
              {error}
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
};
