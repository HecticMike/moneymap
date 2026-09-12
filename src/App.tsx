import { useCallback, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { CATEGORY_META, GROUP_META, groupOf, isIncome, type GroupId } from './domain/categories';
import { formatMoney } from './domain/money';
import { QuickAdd } from './components/QuickAdd';
import { SyncPanel } from './components/SyncPanel';
import { useLedger } from './hooks/useLedger';
import { useSync } from './hooks/useSync';
import { parseLedgerFile, type ParseReport } from './sync/ledgerFile';

const panel = 'border border-brand-line bg-brand-ocean/80 px-4 py-5 shadow-panel';
const label = 'text-[10px] font-semibold uppercase tracking-[0.25em] text-brand-neutral';

const App: React.FC = () => {
  const ledgerApi = useLedger();
  const { ledger, loaded, addEntry, deleteEntry, mergeIn } = ledgerApi;
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
  const fileInput = useRef<HTMLInputElement | null>(null);

  const totals = useMemo(() => {
    let income = 0;
    let spend = 0;
    const byGroup = new Map<GroupId, number>();

    for (const entry of ledger.entries) {
      if (isIncome(entry.category)) {
        income += entry.baseAmount;
        continue;
      }
      spend += entry.baseAmount;
      byGroup.set(groupOf(entry.category), (byGroup.get(groupOf(entry.category)) ?? 0) + entry.baseAmount);
    }

    return { income, spend, groups: [...byGroup.entries()].sort((a, b) => b[1] - a[1]) };
  }, [ledger.entries]);

  const handleDriveImport = useCallback(async () => {
    setImporting(true);
    setImportError(null);
    try {
      const result = await sync.importFromV1();
      if (result == null) {
        setImportError('No money-map-data.json found in your Drive. Try the file drop below instead.');
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

  const recent = ledger.entries.slice(0, 12);

  return (
    <div className="min-h-screen font-sans text-brand-highlight">
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-3xl font-semibold">Money Map</h1>
          <span className="border border-brand-line bg-brand-ocean/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]">
            Slice 2
          </span>
        </header>

        <QuickAdd onAdd={addEntry} />

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

        <section className={panel}>
          <div className="flex items-center justify-between gap-3">
            <h2 className={label}>Totals</h2>
            <span className="text-[10px] uppercase tracking-[0.22em] text-brand-neutral">
              {ledger.entries.length} entries
            </span>
          </div>

          {!loaded ? (
            <p className="mt-3 text-xs text-brand-neutral">Reading…</p>
          ) : ledger.entries.length === 0 ? (
            <p className="mt-3 text-xs text-brand-neutral">
              Nothing yet. Add an entry above, or import your history from the old app.
            </p>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="border border-brand-line bg-brand-midnight/50 px-3 py-3">
                  <p className={label}>Income</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-brand-positive">
                    {formatMoney(totals.income)}
                  </p>
                </div>
                <div className="border border-brand-line bg-brand-midnight/50 px-3 py-3">
                  <p className={label}>Spend</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-brand-accent">
                    {formatMoney(totals.spend)}
                  </p>
                </div>
              </div>

              <h3 className={`${label} mt-5`}>By group</h3>
              <ul className="mt-2 divide-y divide-brand-line border border-brand-line bg-brand-midnight/30">
                {totals.groups.map(([group, value]) => (
                  <li key={group} className="flex items-center gap-3 px-3 py-2 text-xs">
                    <span
                      className="h-2.5 w-2.5 shrink-0 border border-brand-line"
                      style={{ backgroundColor: GROUP_META[group].color }}
                    />
                    <span className="flex-1 truncate">{GROUP_META[group].label}</span>
                    <span className="tabular-nums text-brand-neutral">
                      {totals.spend > 0 ? Math.round((value / totals.spend) * 100) : 0}%
                    </span>
                    <span className="w-20 text-right font-semibold tabular-nums">
                      {formatMoney(value)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {recent.length > 0 ? (
          <section className={panel}>
            <h2 className={label}>Recent</h2>
            <ul className="mt-3 divide-y divide-brand-line border border-brand-line bg-brand-midnight/30">
              {recent.map((entry) => {
                const meta = CATEGORY_META[entry.category];
                const income = meta.kind === 'income';
                return (
                  <li key={entry.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                    <span
                      className="h-6 w-1 shrink-0"
                      style={{ backgroundColor: meta.color }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">
                        {meta.label}
                        {entry.note.length > 0 ? (
                          <span className="text-brand-neutral"> · {entry.note}</span>
                        ) : null}
                      </p>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-brand-neutral">
                        {format(new Date(entry.date), 'd MMM yyyy')}
                        {entry.user != null ? ` · ${entry.user}` : ''}
                        {entry.currency !== 'GBP' ? ` · ${entry.amount} ${entry.currency}` : ''}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 font-semibold tabular-nums ${
                        income ? 'text-brand-positive' : 'text-brand-highlight'
                      }`}
                    >
                      {income ? '+' : '−'}
                      {formatMoney(entry.baseAmount)}
                    </span>
                    {/* 26px before — below Apple's 44pt minimum, on a
                        destructive action sitting next to a scrollable list. */}
                    <button
                      type="button"
                      onClick={() => deleteEntry(entry.id)}
                      aria-label={`Delete ${meta.label} entry`}
                      className="tap-target flex w-11 shrink-0 items-center justify-center border border-brand-line text-brand-accent transition hover:bg-brand-accent/10"
                    >
                      <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" aria-hidden focusable="false">
                        <path
                          d="M2 4h10M5.5 4V2.5h3V4M3.5 4l.6 8h5.8l.6-8M6 6.5v3M8 6.5v3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.2"
                        />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section className={panel}>
          <h2 className={label}>Import from a file</h2>
          <p className="mt-2 text-[11px] text-brand-neutral">
            If the Drive import above cannot find your old backup, download{' '}
            <code className="border border-brand-line bg-brand-midnight px-1">money-map-data.json</code>{' '}
            and drop it here. Importing twice is safe.
          </p>
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              if (file != null) void handleFile(file);
            }}
            className="mt-3 border border-dashed border-brand-line bg-brand-midnight/60 px-4 py-6 text-center"
          >
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="tap-target border border-brand-line px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-highlight transition hover:text-brand-amber"
            >
              Choose file
            </button>
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
            <p className="mt-3 border border-brand-accent bg-brand-accent/10 px-3 py-2 text-[11px] text-brand-accent">
              {importError}
            </p>
          ) : null}

          {report != null ? (
            <div className="mt-3 border border-brand-line bg-brand-midnight/70 px-3 py-3 text-[11px]">
              <p className="font-semibold">
                {report.imported} of {report.read} entries imported
                {report.detected === 'v1' ? ' from the old app' : ''}.
              </p>
              <ul className="mt-1 space-y-0.5 text-brand-neutral">
                {report.skipped > 0 ? <li>{report.skipped} skipped as unreadable</li> : null}
                {report.categoriesCoerced > 0 ? (
                  <li>{report.categoriesCoerced} moved to Other</li>
                ) : null}
                {report.timestampsBackfilled > 0 ? (
                  <li>{report.timestampsBackfilled} timestamps backfilled</li>
                ) : null}
                {report.tombstones > 0 ? <li>{report.tombstones} deletions carried over</li> : null}
              </ul>
              {report.warnings.length > 0 ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-brand-neutral">
                    {report.warnings.length} warning{report.warnings.length === 1 ? '' : 's'}
                  </summary>
                  <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-[10px] text-brand-neutral">
                    {report.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}
        </section>

        <footer className="px-1 pb-6 text-[10px] uppercase tracking-[0.22em] text-brand-neutral">
          Capture speed and insights land in slices 3 and 4.
        </footer>
      </main>
    </div>
  );
};

export default App;
