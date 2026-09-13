import { useRef, useState } from 'react';
import type { FavouriteDraft } from '../domain/favourites';
import { CURRENCY_META } from '../domain/money';
import { HOUSEHOLD } from '../domain/people';
import type { CurrencyCode, Entry, Favourite } from '../domain/types';
import type { ParseReport } from '../sync/ledgerFile';
import { FavouriteManager } from './Favourites';
import { SyncPanel } from './SyncPanel';
import type { SyncStatus } from '../hooks/useSync';
import { CARDS, type CardId, type ViewMode } from '../domain/preferences';
import { Button, Label, Segmented, Sheet, Well, cx } from './ui';

interface SettingsProps {
  open: boolean;
  onClose: () => void;

  view: ViewMode;
  onViewChange: (view: ViewMode) => void;

  cards: Record<CardId, boolean>;
  onCardToggle: (card: CardId, on: boolean) => void;
  customised: boolean;
  onResetPreferences: () => void;

  owner: string | null;
  onOwnerChange: (owner: string) => void;

  captureCurrency: CurrencyCode;
  onCurrencyChange: (currency: CurrencyCode) => void;

  favourites: Favourite[];
  entries: Entry[];
  onAddFavourite: (draft: FavouriteDraft) => void;
  onRemoveFavourite: (id: string) => void;

  sync: {
    status: SyncStatus;
    online: boolean;
    dirty: boolean;
    error: string | null;
    lastSyncedAt: string | null;
    everGranted: boolean;
    onConnect: () => void;
    onDisconnect: () => void;
    onSyncNow: () => void;
  };

  onImportV1: () => void;
  importing: boolean;
  onImportFile: (file: File) => void;
  importError: string | null;
  report: ParseReport | null;
}

const Section: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({
  title,
  hint,
  children
}) => (
  <div>
    <Label>{title}</Label>
    {hint != null ? <p className="mt-1.5 text-caption text-ink-muted">{hint}</p> : null}
    <div className="mt-3">{children}</div>
  </div>
);

export const Settings: React.FC<SettingsProps> = ({
  open,
  onClose,
  view,
  onViewChange,
  cards,
  onCardToggle,
  customised,
  onResetPreferences,
  owner,
  onOwnerChange,
  captureCurrency,
  onCurrencyChange,
  favourites,
  entries,
  onAddFavourite,
  onRemoveFavourite,
  sync,
  onImportV1,
  importing,
  onImportFile,
  importError,
  report
}) => {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [showImport, setShowImport] = useState(false);

  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      {/* First, because it decides what the rest of the app shows. */}
      <Section
        title="What to show"
        hint={
          view === 'spending'
            ? 'Spending only — where the money goes, income left out of the insights entirely.'
            : 'Balance adds income against outgoings, net and savings rate, on top of the spending view.'
        }
      >
        <Segmented
          ariaLabel="What the insights show"
          className="flex w-full"
          value={view}
          onChange={onViewChange}
          options={[
            { value: 'spending', label: 'Spending' },
            { value: 'balance', label: 'Balance' }
          ]}
        />
      </Section>

      {/* These are per-person. Everything above this point is the device's. */}
      <Section
        title={owner == null ? 'Your cards' : `${owner}'s cards`}
        hint="Turn off anything you do not use. This only changes your phone — it does not affect what the other person sees."
      >
        <Well>
          <ul className="divide-y divide-edge/60">
            {CARDS.map((card) => {
              const on = cards[card.id];
              return (
                <li key={card.id}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() => onCardToggle(card.id, !on)}
                    className="pressable flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-surface-high/40"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-caption text-ink">{card.label}</span>
                      <span className="block text-micro text-ink-faint">{card.hint}</span>
                    </span>
                    {/* A real switch: the state is visible without colour alone,
                        because the knob moves. */}
                    <span
                      className={cx(
                        'relative h-6 w-10 shrink-0 rounded-pill transition-colors',
                        on ? 'bg-brand-highlight' : 'bg-surface-base'
                      )}
                      aria-hidden
                    >
                      <span
                        className={cx(
                          'absolute top-1 h-4 w-4 rounded-full transition-all',
                          on ? 'left-5 bg-surface-base' : 'left-1 bg-ink-faint'
                        )}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Well>

        {customised ? (
          <button
            type="button"
            onClick={onResetPreferences}
            className="tap-target pressable mt-3 px-1 text-caption text-ink-muted hover:text-brand-highlight"
          >
            Back to the defaults
          </button>
        ) : (
          <p className="mt-3 text-micro uppercase tracking-[0.12em] text-ink-faint">
            Currently on the defaults
          </p>
        )}
      </Section>

      <Section
        title="This phone"
        hint="New entries default to this person, and their favourites open first."
      >
        <Segmented
          ariaLabel="Whose phone this is"
          className="flex w-full"
          value={owner ?? ''}
          onChange={onOwnerChange}
          options={HOUSEHOLD.map((person) => ({ value: person as string, label: person }))}
        />
      </Section>

      {/* Moved out of the capture screen: this changes when the household
          travels, not between one coffee and the next. */}
      <Section
        title="Capture in"
        hint="Switch this when you travel. Amounts are converted to pounds at the rate on the day, and that rate is kept with the entry."
      >
        <Segmented
          ariaLabel="Currency for new entries"
          className="flex w-full"
          value={captureCurrency}
          onChange={onCurrencyChange}
          options={(Object.keys(CURRENCY_META) as CurrencyCode[]).map((code) => ({
            value: code,
            label: `${CURRENCY_META[code].symbol} ${code}`
          }))}
        />
        {captureCurrency !== 'GBP' ? (
          <p className="mt-2.5 rounded-control border border-brand-highlight/30 bg-brand-highlight/10 px-3.5 py-2.5 text-caption text-brand-highlight">
            Entries are being saved in {CURRENCY_META[captureCurrency].label}. Remember to switch
            back when you get home.
          </p>
        ) : null}
      </Section>

      <Section title="Favourites" hint="Shortcuts each of you keeps. They sync to both phones.">
        <FavouriteManager
          favourites={favourites}
          entries={entries}
          owner={owner}
          onAdd={onAddFavourite}
          onRemove={onRemoveFavourite}
        />
      </Section>

      <Section title="Backup">
        <SyncPanel
          status={sync.status}
          online={sync.online}
          dirty={sync.dirty}
          error={sync.error}
          lastSyncedAt={sync.lastSyncedAt}
          everGranted={sync.everGranted}
          onConnect={sync.onConnect}
          onDisconnect={sync.onDisconnect}
          onSyncNow={sync.onSyncNow}
          onImportV1={onImportV1}
          importing={importing}
        />
      </Section>

      <Section title="Import">
        <Button variant="quiet" onClick={() => setShowImport((open) => !open)}>
          {showImport ? 'Hide file import' : 'Import from a file instead'}
        </Button>

        {showImport ? (
          <div className="mt-3 animate-rise-in">
            <p className="text-caption text-ink-muted">
              If the Drive import cannot find your old backup, download{' '}
              <code className="rounded bg-surface-inset px-1.5 py-0.5 text-ink">
                money-map-data.json
              </code>{' '}
              and choose it here. Importing twice is safe.
            </p>
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files[0];
                if (file != null) onImportFile(file);
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
                  if (file != null) onImportFile(file);
                  event.target.value = '';
                }}
              />
            </div>
          </div>
        ) : null}

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
      </Section>

      <p className={cx('pt-2 text-center text-micro uppercase tracking-[0.14em] text-ink-faint')}>
        Money Map · {entries.length} entries
      </p>
    </Sheet>
  );
};
