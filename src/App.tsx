import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_META, GROUP_META, groupOf, isIncome, type GroupId } from './domain/categories';
import { formatMoney } from './domain/money';
import type { LedgerState } from './domain/types';
import { mergeLedgers } from './sync/merge';
import { parseLedgerFile, type ParseReport } from './sync/ledgerFile';
import { loadLedger, saveLedger } from './storage/ledgerStore';

/**
 * Slice 1 shell.
 *
 * Deliberately not the real interface — capture and insights land in slices 3
 * and 4. What this does do is exercise the whole foundation end to end
 * (parse → merge → IndexedDB → read back) and let the household verify its real
 * history imports correctly *before* slice 2 automates the Drive round trip.
 */

const panel = 'border border-brand-line bg-brand-ocean/80 px-4 py-5 shadow-panel';
const label = 'text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-neutral';

const App: React.FC = () => {
  const [ledger, setLedger] = useState<LedgerState>({ entries: [], tombstones: [] });
  const [report, setReport] = useState<ParseReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void loadLedger().then((state) => {
      setLedger(state);
      setLoaded(true);
    });
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const parsed = parseLedgerFile(JSON.parse(await file.text()));

      if (parsed.report.detected === 'unknown') {
        setError(
          `"${file.name}" is not a Money Map backup. Expected a file containing an "expenses" or "entries" array.`
        );
        setReport(parsed.report);
        return;
      }

      // Merge rather than replace, so importing twice is harmless and importing
      // a second device's file adds to what is already here.
      setLedger((current) => {
        const merged = mergeLedgers(current, parsed.state);
        void saveLedger(merged);
        return merged;
      });
      setReport(parsed.report);
    } catch (cause) {
      setError(cause instanceof Error ? `Could not read that file: ${cause.message}` : 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  }, []);

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
      const group = groupOf(entry.category);
      byGroup.set(group, (byGroup.get(group) ?? 0) + entry.baseAmount);
    }

    return {
      income,
      spend,
      net: income - spend,
      groups: [...byGroup.entries()].sort((a, b) => b[1] - a[1])
    };
  }, [ledger.entries]);

  const foreignCount = useMemo(
    () => ledger.entries.filter((entry) => entry.currency !== 'GBP').length,
    [ledger.entries]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-midnight via-brand-ocean to-brand-midnight font-sans text-brand-highlight">
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold md:text-4xl">Money Map</h1>
            <p className="mt-1 text-[11px] uppercase tracking-[0.28em] text-brand-neutral">
              Foundation build
            </p>
          </div>
          <span className="border border-brand-line bg-brand-ocean/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em]">
            Slice 1
          </span>
        </header>

        <section className={panel}>
          <h2 className={label}>Import your history</h2>
          <p className="mt-3 text-xs text-brand-neutral">
            Download <code className="border border-brand-line bg-brand-midnight px-1">money-map-data.json</code>{' '}
            from Google Drive and drop it here. Nothing leaves this device, and your existing Money
            Map is not touched. Importing the same file twice is safe.
          </p>

          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              if (file != null) void handleFile(file);
            }}
            className="mt-4 border border-dashed border-brand-line bg-brand-midnight/60 px-4 py-8 text-center"
          >
            <p className="text-xs text-brand-neutral">Drop the backup file here</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              className="mt-4 border border-brand-line bg-brand-highlight px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-midnight transition hover:bg-brand-amber disabled:cursor-not-allowed disabled:bg-brand-slate/60"
            >
              {busy ? 'Reading…' : 'Choose file'}
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

          {error != null ? (
            <p className="mt-4 border border-brand-accent bg-brand-accent/10 px-3 py-2 text-[11px] text-brand-accent">
              {error}
            </p>
          ) : null}

          {report != null && report.detected !== 'unknown' ? (
            <div className="mt-4 border border-brand-line bg-brand-midnight/70 px-4 py-3 text-[11px]">
              <p className="font-semibold">
                Read {report.detected === 'v1' ? 'a money-map v1 backup' : 'a Money Map backup'} —{' '}
                {report.imported} of {report.read} entries imported.
              </p>
              <ul className="mt-2 space-y-1 text-brand-neutral">
                {report.skipped > 0 ? <li>{report.skipped} skipped as unreadable</li> : null}
                {report.categoriesCoerced > 0 ? (
                  <li>{report.categoriesCoerced} moved to Other (category no longer exists)</li>
                ) : null}
                {report.timestampsBackfilled > 0 ? (
                  <li>{report.timestampsBackfilled} had timestamps backfilled</li>
                ) : null}
                {report.tombstones > 0 ? <li>{report.tombstones} deletions carried over</li> : null}
              </ul>
              {report.warnings.length > 0 ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-brand-neutral">
                    {report.warnings.length} warning{report.warnings.length === 1 ? '' : 's'}
                  </summary>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-[10px] text-brand-neutral">
                    {report.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className={panel}>
          <h2 className={label}>What's stored on this device</h2>
          {!loaded ? (
            <p className="mt-3 text-xs text-brand-neutral">Reading…</p>
          ) : ledger.entries.length === 0 ? (
            <p className="mt-3 text-xs text-brand-neutral">
              Nothing yet. Import a backup above to check your history survives the trip.
            </p>
          ) : (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="border border-brand-line bg-brand-midnight/50 px-3 py-3">
                  <p className={label}>Entries</p>
                  <p className="mt-2 text-2xl font-semibold">{ledger.entries.length}</p>
                </div>
                <div className="border border-brand-line bg-brand-midnight/50 px-3 py-3">
                  <p className={label}>Income</p>
                  <p className="mt-2 text-xl font-semibold text-brand-positive">
                    {formatMoney(totals.income)}
                  </p>
                </div>
                <div className="border border-brand-line bg-brand-midnight/50 px-3 py-3">
                  <p className={label}>Spend</p>
                  <p className="mt-2 text-xl font-semibold text-brand-accent">
                    {formatMoney(totals.spend)}
                  </p>
                </div>
              </div>

              {/* The group rollup v1 had the data for but never showed. */}
              <h3 className={`${label} mt-6`}>Where it goes, by group</h3>
              <ul className="mt-3 divide-y divide-brand-line border border-brand-line bg-brand-midnight/30">
                {totals.groups.map(([group, value]) => (
                  <li key={group} className="flex items-center gap-3 px-3 py-2 text-xs">
                    <span
                      className="h-2.5 w-2.5 shrink-0 border border-brand-line"
                      style={{ backgroundColor: GROUP_META[group].color }}
                    />
                    <span className="flex-1">{GROUP_META[group].label}</span>
                    <span className="tabular-nums text-brand-neutral">
                      {totals.spend > 0 ? Math.round((value / totals.spend) * 100) : 0}%
                    </span>
                    <span className="w-24 text-right font-semibold tabular-nums">
                      {formatMoney(value)}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="mt-4 text-[10px] uppercase tracking-[0.22em] text-brand-neutral">
                {Object.keys(CATEGORY_META).length} categories · {ledger.tombstones.length} deletions
                tracked · {foreignCount} non-GBP
              </p>
            </>
          )}
        </section>

        <footer className="px-1 pb-4 text-[10px] uppercase tracking-[0.25em] text-brand-neutral">
          Foundation only — capture, sync and insights land in slices 2 to 4.
        </footer>
      </main>
    </div>
  );
};

export default App;
