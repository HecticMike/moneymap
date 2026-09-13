import { useMemo, useState } from 'react';
import { CATEGORY_META, type CategoryId } from '../domain/categories';
import { suggestFavourites, type FavouriteDraft } from '../domain/favourites';
import { CURRENCY_META, formatMoney } from '../domain/money';
import { HOUSEHOLD } from '../domain/people';
import type { Entry, Favourite } from '../domain/types';
import { Chip, ConfirmButton, Label, Segmented, Well, cx } from './ui';

/**
 * Favourites appear in two places with different jobs.
 *
 * `FavouriteChips` lives on the capture screen and does one thing: apply a
 * shortcut in a tap. `FavouriteManager` lives in settings and handles adding,
 * removing and the suggestions — management clutter that has no business
 * sitting between someone and logging a coffee.
 */

const forTab = (favourites: Favourite[], tab: string): Favourite[] =>
  favourites.filter((favourite) => favourite.person === tab || favourite.person === null);

interface ChipsProps {
  favourites: Favourite[];
  owner: string | null;
  onApply: (favourite: Favourite) => void;
}

export const FavouriteChips: React.FC<ChipsProps> = ({ favourites, owner, onApply }) => {
  const [tab, setTab] = useState<string>(() => owner ?? HOUSEHOLD[0]);
  const shown = useMemo(() => forTab(favourites, tab), [favourites, tab]);

  if (favourites.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Label>Favourites</Label>
        {/* The tabs are what let one phone log the other person's spending
            with their shortcuts rather than retyping everything. */}
        <Segmented
          ariaLabel="Whose favourites"
          value={tab}
          onChange={setTab}
          options={HOUSEHOLD.map((person) => ({ value: person as string, label: person }))}
        />
      </div>

      {shown.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {shown.map((favourite) => (
            <Chip
              key={favourite.id}
              dot={CATEGORY_META[favourite.category as CategoryId].color}
              onClick={() => onApply(favourite)}
            >
              {favourite.label}
              {favourite.amount != null ? (
                <span className="tnum text-ink-muted">
                  {formatMoney(favourite.amount, favourite.currency)}
                </span>
              ) : null}
            </Chip>
          ))}
        </div>
      ) : (
        <p className="mt-2.5 text-caption text-ink-muted">
          Nothing saved for {tab} yet — add some in Settings.
        </p>
      )}
    </div>
  );
};

interface ManagerProps {
  favourites: Favourite[];
  entries: Entry[];
  owner: string | null;
  onAdd: (draft: FavouriteDraft) => void;
  onRemove: (id: string) => void;
}

export const FavouriteManager: React.FC<ManagerProps> = ({
  favourites,
  entries,
  owner,
  onAdd,
  onRemove
}) => {
  const [tab, setTab] = useState<string>(() => owner ?? HOUSEHOLD[0]);

  const shown = useMemo(() => forTab(favourites, tab), [favourites, tab]);
  const suggestions = useMemo(
    () => suggestFavourites(entries, tab, favourites, { limit: 5 }),
    [entries, tab, favourites]
  );

  return (
    <div>
      <Segmented
        ariaLabel="Whose favourites"
        className="flex w-full"
        value={tab}
        onChange={setTab}
        options={HOUSEHOLD.map((person) => ({ value: person as string, label: person }))}
      />

      {shown.length > 0 ? (
        <Well className="mt-3">
          <ul className="divide-y divide-edge/60">
            {shown.map((favourite) => (
              <li key={favourite.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: CATEGORY_META[favourite.category as CategoryId].color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-caption text-ink">{favourite.label}</p>
                  <p className="text-micro uppercase tracking-[0.12em] text-ink-faint">
                    {CATEGORY_META[favourite.category as CategoryId].label}
                    {favourite.person === null ? ' · both of you' : ''}
                    {favourite.amount != null
                      ? ` · ${formatMoney(favourite.amount, favourite.currency)}`
                      : ''}
                  </p>
                </div>
                <ConfirmButton
                  onConfirm={() => onRemove(favourite.id)}
                  ariaLabel={`Remove favourite ${favourite.label}`}
                  label="Tap again to remove"
                  confirmLabel="Remove"
                  className="flex h-11 w-9 items-center justify-center rounded-control text-ink-faint hover:bg-brand-accent/10 hover:text-brand-accent"
                >
                  <svg viewBox="0 0 14 14" className="h-4 w-4" aria-hidden focusable="false">
                    <path
                      d="M2 4h10M5.5 4V2.5h3V4M3.5 4l.6 8h5.8l.6-8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                  </svg>
                </ConfirmButton>
              </li>
            ))}
          </ul>
        </Well>
      ) : (
        <p className="mt-3 text-caption text-ink-muted">
          Nothing saved for {tab} yet.
        </p>
      )}

      {/* Proposed from this person's own history — never added automatically.
          The household chooses its shortcuts; the app only points at patterns. */}
      {suggestions.length > 0 ? (
        <div className="mt-4">
          <p className="text-micro uppercase tracking-[0.14em] text-ink-faint">
            {tab} logs these often
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={`${suggestion.category}:${suggestion.note}`}
                type="button"
                onClick={() =>
                  onAdd({
                    label: suggestion.label,
                    person: suggestion.person,
                    category: suggestion.category,
                    currency: suggestion.currency,
                    amount: null,
                    note: suggestion.note
                  })
                }
                className={cx(
                  'tap-target pressable inline-flex items-center gap-2 rounded-pill border border-dashed',
                  'border-edge-strong px-3.5 text-caption text-ink-muted',
                  'hover:border-brand-highlight hover:text-brand-highlight'
                )}
              >
                <span className="text-brand-highlight">+</span>
                {suggestion.label}
                <span className="tnum text-ink-faint">
                  ×{suggestion.count} · {CURRENCY_META[suggestion.currency].symbol}
                  {suggestion.typicalAmount}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-caption text-ink-faint">
          Log something three times and it will be offered here as a shortcut.
        </p>
      )}
    </div>
  );
};

interface SaveCurrentProps {
  /** The entry being composed, offered as "save this as a favourite". */
  current: { category: CategoryId; note: string } | null;
  favourites: Favourite[];
  owner: string | null;
  currency: Favourite['currency'];
  onAdd: (draft: FavouriteDraft) => void;
}

/** Offered on the capture screen only once there is something worth saving. */
export const SaveAsFavourite: React.FC<SaveCurrentProps> = ({
  current,
  favourites,
  owner,
  currency,
  onAdd
}) => {
  const [saved, setSaved] = useState(false);
  const person = owner ?? HOUSEHOLD[0];

  const already =
    current != null &&
    forTab(favourites, person).some(
      (favourite) =>
        favourite.category === current.category &&
        favourite.note.trim().toLowerCase() === current.note.trim().toLowerCase()
    );

  if (current == null || already || current.note.trim() === '') return null;

  if (saved) {
    return <p className="mt-2.5 text-caption text-brand-positive">Saved to favourites.</p>;
  }

  return (
    <button
      type="button"
      onClick={() => {
        onAdd({
          label: current.note.trim(),
          person,
          category: current.category,
          currency,
          amount: null,
          note: current.note
        });
        setSaved(true);
      }}
      className="tap-target pressable mt-2.5 text-caption text-ink-muted hover:text-brand-highlight"
    >
      + Save “{current.note.trim()}” as a favourite
    </button>
  );
};
