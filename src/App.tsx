import { useCallback, useRef, useState } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { CATEGORY_META } from './domain/categories';
import { formatMoney } from './domain/money';
import { HOUSEHOLD } from './domain/people';
import { Capture } from './components/Capture';
import { Insights } from './components/Insights';
import { SyncPanel } from './components/SyncPanel';
import { Button, Card, CardHeader, Label, Well, cx } from './components/ui';
import { useLedger } from './hooks/useLedger';
import { useSettings } from './hooks/useSettings';
import { useSync } from './hooks/useSync';
import { parseLedgerFile, type ParseReport } from './sync/ledgerFile';

/** "Today" and "Yesterday" read faster than a date on the two rows that matter. */
const relativeDay = (iso: string): string => {
  const date = new Date(iso);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'd MMM yyyy');
};

const App: React.FC = () => {
  const ledgerApi = useLedger();
  const { ledger, loaded, addEntry, deleteEntry, mergeIn } = ledgerApi;
  const { settings, loaded: settingsLoaded, setOwner } = useSettings();
  const sync = useSync({
    ledger,
    revision: ledgerApi.revision,
    dirty: ledgerApi.dirty,
    loaded,
    mergeIn,
    markSynced: ledgerApi.markSynced
  });

  const [report, setReport] = useState<ParseReport | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const handleDriveImport = useCallback(async () => {
    setImporting(true);
    setImportError(null);
    try {
      const result = await sync.importFromV1();
      if (result == null) {
        setImportError('No money-map-data.json found in your Drive. Try the file drop below.');
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

  return (
    <div className="min-h-screen font-sans text-ink">
      <main className="mx-auto max-w-2xl space-y-4 px-4 pb-10 pt-7">
        <header className="flex items-center justify-between gap-3 px-1">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-figure font-bold tracking-tight text-brand-highlight">Money Map</h1>
          </div>
          {ledger.entries.length > 0 ? (
            <span className="tnum text-micro uppercase tracking-[0.12em] text-ink-faint">
              {ledger.entries.length} entries
            </span>
          ) : null}
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
          onAdd={addEntry}
          onUseFavourite={ledgerApi.useFavourite}
          onAddFavourite={ledgerApi.addFavourite}
          onRemoveFavourite={ledgerApi.removeFavourite}
        />

        <Insights entries={ledger.entries} />

        {!loaded ? (
          <Card>
            <p className="text-caption text-ink-muted">Reading…</p>
          </Card>
        ) : ledger.entries.length === 0 ? (
          <Card>
            <Label>Nothing here yet</Label>
            <p className="mt-2 text-caption text-ink-muted">
              Add an entry above, or import your history from the old app to see where the money
              has been going.
            </p>
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
                    <li key={entry.id} className="group flex items-center gap-3 px-3.5 py-3">
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
                          {entry.currency !== 'GBP'
                            ? ` · ${entry.amount} ${entry.currency}`
                            : ''}
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
                      <button
                        type="button"
                        onClick={() => deleteEntry(entry.id)}
                        aria-label={`Delete ${meta.label} entry`}
                        className="pressable flex h-11 w-9 shrink-0 items-center justify-center rounded-control text-ink-faint hover:bg-brand-accent/10 hover:text-brand-accent"
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
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Well>
          </Card>
        )}

        <SyncPanel
          status={sync.status}
          online={sync.online}
          dirty={sync.dirty}
          error={sync.error}
          lastSyncedAt={sync.lastSyncedAt}
          everGranted={sync.auth.everGranted}
          onConnect={() => void sync.connect()}
          onDisconnect={sync.disconnect}
          onSyncNow={() => void sync.syncNow()}
          onImportV1={() => void handleDriveImport()}
          importing={importing}
        />

        <Card tight>
          <Label>Import from a file</Label>
          <p className="mt-2 text-caption text-ink-muted">
            If the Drive import cannot find your old backup, download{' '}
            <code className="rounded bg-surface-inset px-1.5 py-0.5 text-ink">money-map-data.json</code>{' '}
            and drop it here. Importing twice is safe.
          </p>
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              if (file != null) void handleFile(file);
            }}
            className="mt-3 rounded-control border border-dashed border-edge bg-surface-inset/50 px-4 py-6 text-center"
          >
            <Button variant="outline" onClick={() => fileInput.current?.click()}>
              Choose file
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file != null) void handleFile(file);
                event.target.value = '';
              }}
            />
          </div>

          {importError != null ? (
            <p className="mt-3 rounded-control border border-brand-accent/40 bg-brand-accent/10 px-3.5 py-2.5 text-caption text-brand-accent">
              {importError}
            </p>
          ) : null}

          {report != null ? (
            <div className="mt-3 animate-rise-in rounded-control bg-surface-inset/70 px-3.5 py-3">
              <p className="text-caption font-semibold text-ink">
                {report.imported} of {report.read} entries imported
                {report.detected === 'v1' ? ' from the old app' : ''}.
              </p>
              <ul className="mt-1.5 space-y-0.5 text-caption text-ink-muted">
                {report.skipped > 0 ? <li>{report.skipped} skipped as unreadable</li> : null}
                {report.categoriesCoerced > 0 ? (
                  <li>{report.categoriesCoerced} moved to Other</li>
                ) : null}
                {report.timestampsBackfilled > 0 ? (
                  <li>{report.timestampsBackfilled} timestamps backfilled</li>
                ) : null}
                {report.tombstones > 0 ? <li>{report.tombstones} deletions carried over</li> : null}
                {report.favourites > 0 ? <li>{report.favourites} favourites restored</li> : null}
              </ul>
              {report.warnings.length > 0 ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-caption text-ink-muted hover:text-brand-highlight">
                    {report.warnings.length} warning{report.warnings.length === 1 ? '' : 's'}
                  </summary>
                  <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto text-micro tracking-normal text-ink-faint">
                    {report.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}
        </Card>
      </main>
    </div>
  );
};

export default App;
