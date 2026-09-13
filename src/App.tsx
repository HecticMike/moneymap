import { useCallback, useEffect, useRef, useState } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { CATEGORY_META } from './domain/categories';
import { formatMoney } from './domain/money';
import { HOUSEHOLD } from './domain/people';
import { Balance } from './components/Balance';
import { Capture } from './components/Capture';
import { Insights } from './components/Insights';
import { Settings } from './components/Settings';
import { Button, Card, CardHeader, ConfirmButton, Label, Well, cx } from './components/ui';
import { useLedger } from './hooks/useLedger';
import { useSettings } from './hooks/useSettings';
import { useSync } from './hooks/useSync';
import { parseLedgerFile, type ParseReport } from './sync/ledgerFile';

/** "Today" and "Yesterday" read faster than a date on the rows that matter. */
const relativeDay = (iso: string): string => {
  const date = new Date(iso);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'd MMM yyyy');
};

/** The pixel-M from the app icon, simplified to work at 28px. */
const Mark: React.FC = () => (
  <span
    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-highlight shadow-glow"
    aria-hidden
  >
    <svg viewBox="0 0 20 20" className="h-5 w-5">
      <path
        d="M2 17V3h3.6L10 9.4 14.4 3H18v14h-3.4V8.6L10 14.8 5.4 8.6V17z"
        fill="#090b1d"
      />
    </svg>
  </span>
);

const App: React.FC = () => {
  const ledgerApi = useLedger();
  const { ledger, loaded, addEntry, deleteEntry, mergeIn } = ledgerApi;
  const {
    settings,
    loaded: settingsLoaded,
    setOwner,
    setCaptureCurrency,
    setView
  } = useSettings();
  const sync = useSync({
    ledger,
    revision: ledgerApi.revision,
    dirty: ledgerApi.dirty,
    loaded,
    mergeIn,
    markSynced: ledgerApi.markSynced
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);

  /**
   * Take the page behind the sheet out of the accessibility tree and out of tab
   * order while it is open. Without this the sheet only *looks* modal:
   * everything behind it stays focusable and reachable by a screen reader.
   * Set imperatively because React 18's types do not know about `inert`.
   */
  useEffect(() => {
    const element = mainRef.current;
    if (element == null) return;

    if (settingsOpen) {
      element.setAttribute('inert', '');
      element.setAttribute('aria-hidden', 'true');
    } else {
      element.removeAttribute('inert');
      element.removeAttribute('aria-hidden');
    }
  }, [settingsOpen]);
  const [report, setReport] = useState<ParseReport | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const handleDriveImport = useCallback(async () => {
    setImporting(true);
    setImportError(null);
    try {
      const result = await sync.importFromV1();
      if (result == null) {
        setImportError('No money-map-data.json found in your Drive. Try the file import below.');
      } else {
        setReport(result);
      }
    } catch (cause) {
      setImportError(cause instanceof Error ? cause.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  }, [sync]);

  const handleFile = useCallback(
    async (file: File) => {
      setImportError(null);
      try {
        const parsed = parseLedgerFile(JSON.parse(await file.text()));
        if (parsed.report.detected === 'unknown') {
          setImportError(`"${file.name}" is not a Money Map backup.`);
          return;
        }
        mergeIn(parsed.state);
        setReport(parsed.report);
      } catch (cause) {
        setImportError(cause instanceof Error ? cause.message : 'Could not read that file.');
      }
    },
    [mergeIn]
  );

  const visible = showAll ? ledger.entries : ledger.entries.slice(0, 12);
  const syncDot =
    sync.status === 'idle' ? 'bg-brand-positive' : sync.status === 'error' ? 'bg-brand-accent' : 'bg-ink-faint';

  return (
    <div className="min-h-screen font-sans text-ink">
      <main ref={mainRef} className="mx-auto max-w-2xl space-y-4 px-4 pb-12 pt-6">
        <header className="flex items-center justify-between gap-3 px-0.5">
          <div className="flex items-center gap-2.5">
            <Mark />
            <div>
              <h1 className="text-lead font-bold leading-none tracking-tight text-ink">Money Map</h1>
              <p className="mt-1 text-micro uppercase tracking-[0.14em] text-ink-faint">
                {ledger.entries.length > 0 ? `${ledger.entries.length} entries` : 'Ready'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            className="pressable relative flex h-11 w-11 items-center justify-center rounded-control border border-edge bg-surface-raised text-ink-muted hover:text-ink"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden focusable="false">
              <path
                d="M10 13a3 3 0 100-6 3 3 0 000 6z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              />
              <path
                d="M16.3 12.1a1.3 1.3 0 00.26 1.43l.05.05a1.55 1.55 0 11-2.2 2.2l-.04-.05a1.3 1.3 0 00-1.43-.26 1.3 1.3 0 00-.79 1.19v.13a1.55 1.55 0 11-3.1 0v-.07a1.3 1.3 0 00-.85-1.19 1.3 1.3 0 00-1.43.26l-.05.05a1.55 1.55 0 11-2.2-2.2l.05-.05a1.3 1.3 0 00.26-1.43 1.3 1.3 0 00-1.19-.79h-.13a1.55 1.55 0 110-3.1h.07a1.3 1.3 0 001.19-.85 1.3 1.3 0 00-.26-1.43l-.05-.05a1.55 1.55 0 112.2-2.2l.05.05a1.3 1.3 0 001.43.26h.06a1.3 1.3 0 00.79-1.19v-.13a1.55 1.55 0 113.1 0v.07a1.3 1.3 0 00.79 1.19 1.3 1.3 0 001.43-.26l.05-.05a1.55 1.55 0 112.2 2.2l-.05.05a1.3 1.3 0 00-.26 1.43v.06a1.3 1.3 0 001.19.79h.13a1.55 1.55 0 110 3.1h-.07a1.3 1.3 0 00-1.19.79z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
            {/* Sync state lives here rather than taking a whole card on the
                main screen — it only needs attention when it goes wrong. */}
            <span
              className={cx(
                'absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full',
                syncDot,
                sync.status === 'syncing' && 'animate-pulse'
              )}
              aria-hidden
            />
          </button>
        </header>

        {/* Asked once, then never again. Knowing whose phone this is defaults
            the person on every entry and opens the right favourites tab. */}
        {settingsLoaded && settings.owner == null ? (
          <Card className="animate-rise-in">
            <Label>Whose phone is this?</Label>
            <p className="mt-2 text-caption text-ink-muted">
              Entries default to this person and their favourites open first. You can still log for
              anyone.
            </p>
            <div className="mt-3.5 grid grid-cols-2 gap-2">
              {HOUSEHOLD.map((person) => (
                <Button key={person} variant="outline" onClick={() => setOwner(person)}>
                  {person}
                </Button>
              ))}
            </div>
          </Card>
        ) : null}

        <Capture
          entries={ledger.entries}
          favourites={ledger.favourites}
          owner={settings.owner}
          currency={settings.captureCurrency}
          onAdd={addEntry}
          onUseFavourite={ledgerApi.useFavourite}
          onAddFavourite={ledgerApi.addFavourite}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        {/* Balance first when it is switched on — if someone has opted into
            tracking a budget, the net is the number they came for. Spending
            stays underneath either way, because that is still the app. */}
        {settings.view === 'balance' ? <Balance entries={ledger.entries} /> : null}

        <Insights entries={ledger.entries} showIncome={settings.view === 'balance'} />

        {!loaded ? (
          <Card>
            <p className="text-caption text-ink-muted">Reading…</p>
          </Card>
        ) : ledger.entries.length === 0 ? (
          <Card className="text-center">
            <p className="text-lead font-semibold text-ink">Nothing here yet</p>
            <p className="mx-auto mt-2 max-w-xs text-caption text-ink-muted">
              Add an entry above, or bring your history across from the old app to see where the
              money has been going.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => setSettingsOpen(true)}>
              Import from the old app
            </Button>
          </Card>
        ) : (
          <Card>
            <CardHeader
              title="Recent"
              aside={
                ledger.entries.length > 12 ? (
                  <button
                    type="button"
                    onClick={() => setShowAll((open) => !open)}
                    className="tap-target pressable px-1 text-caption text-ink-muted hover:text-brand-highlight"
                  >
                    {showAll ? 'Show less' : `All ${ledger.entries.length}`}
                  </button>
                ) : null
              }
            />

            <Well className="mt-3">
              <ul className="divide-y divide-edge/60">
                {visible.map((entry) => {
                  const meta = CATEGORY_META[entry.category];
                  const income = meta.kind === 'income';
                  return (
                    <li key={entry.id} className="flex items-center gap-3 px-3.5 py-3">
                      <span
                        className="h-8 w-1 shrink-0 rounded-pill"
                        style={{ backgroundColor: meta.color }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-caption text-ink">
                          {meta.label}
                          {entry.note.length > 0 ? (
                            <span className="text-ink-muted"> · {entry.note}</span>
                          ) : null}
                        </p>
                        <p className="text-micro uppercase tracking-[0.12em] text-ink-faint">
                          {relativeDay(entry.date)}
                          {entry.user != null ? ` · ${entry.user}` : ''}
                          {entry.currency !== 'GBP' ? ` · ${entry.amount} ${entry.currency}` : ''}
                        </p>
                      </div>
                      <span
                        className={cx(
                          'tnum shrink-0 text-caption font-semibold',
                          income ? 'text-brand-positive' : 'text-ink'
                        )}
                      >
                        {income ? '+' : '−'}
                        {formatMoney(entry.baseAmount)}
                      </span>
                      {/* Deleting is the one destructive action in the app and
                          it sits in a scrollable list, so it takes two taps. */}
                      <ConfirmButton
                        onConfirm={() => deleteEntry(entry.id)}
                        ariaLabel={`Delete ${meta.label} entry of ${formatMoney(entry.baseAmount)}`}
                        label="Tap again to delete"
                        confirmLabel="Delete"
                        className="flex h-11 w-9 items-center justify-center rounded-control text-ink-faint hover:bg-brand-accent/10 hover:text-brand-accent"
                      >
                        <svg viewBox="0 0 14 14" className="h-4 w-4" aria-hidden focusable="false">
                          <path
                            d="M2 4h10M5.5 4V2.5h3V4M3.5 4l.6 8h5.8l.6-8M6 6.5v3M8 6.5v3"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                          />
                        </svg>
                      </ConfirmButton>
                    </li>
                  );
                })}
              </ul>
            </Well>
          </Card>
        )}
      </main>

      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        view={settings.view}
        onViewChange={setView}
        owner={settings.owner}
        onOwnerChange={setOwner}
        captureCurrency={settings.captureCurrency}
        onCurrencyChange={setCaptureCurrency}
        favourites={ledger.favourites}
        entries={ledger.entries}
        onAddFavourite={ledgerApi.addFavourite}
        onRemoveFavourite={ledgerApi.removeFavourite}
        sync={{
          status: sync.status,
          online: sync.online,
          dirty: sync.dirty,
          error: sync.error,
          lastSyncedAt: sync.lastSyncedAt,
          everGranted: sync.auth.everGranted,
          onConnect: () => void sync.connect(),
          onDisconnect: sync.disconnect,
          onSyncNow: () => void sync.syncNow()
        }}
        onImportV1={() => void handleDriveImport()}
        importing={importing}
        onImportFile={(file) => void handleFile(file)}
        importError={importError}
        report={report}
      />
    </div>
  );
};

export default App;
