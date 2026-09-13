import { useMemo, useState } from 'react';
import { CATEGORY_META, type CategoryId } from '../domain/categories';
import { suggestFavourites, type FavouriteDraft } from '../domain/favourites';
import { CURRENCY_META, formatMoney } from '../domain/money';
import { HOUSEHOLD } from '../domain/people';
import type { CurrencyCode, Entry, Favourite } from '../domain/types';
import { Chip, Label, Segmented, cx } from './ui';

interface FavouritesProps {
  favourites: Favourite[];
  entries: Entry[];
  /** Who this phone belongs to; decides which tab opens first. */
  owner: string | null;
  onApply: (favourite: Favourite) => void;
  onAdd: (draft: FavouriteDraft) => void;
  onRemove: (id: string) => void;
  /** The entry currently being composed, offered as "save this". */
  current: { category: CategoryId; currency: CurrencyCode; note: string; person: string | null } | null;
}

export const Favourites: React.FC<FavouritesProps> = ({
  favourites,
  entries,
  owner,
  onApply,
  onAdd,
  onRemove,
  current
}) => {
  const [tab, setTab] = useState<string>(() => owner ?? HOUSEHOLD[0]);
  const [editing, setEditing] = useState(false);

  // Each person sees their own shortcuts plus the shared household ones. The
  // tabs are what let one phone log the other person's spending with their
  // shortcuts rather than retyping everything.
  const shown = useMemo(
    () => favourites.filter((favourite) => favourite.person === tab || favourite.person === null),
    [favourites, tab]
  );

  const suggestions = useMemo(
    () => suggestFavourites(entries, tab, favourites, { limit: 3 }),
    [entries, tab, favourites]
  );

  const canSaveCurrent =
    current != null &&
    !shown.some(
      (favourite) =>
        favourite.category === current.category &&
        favourite.note.trim().toLowerCase() === current.note.trim().toLowerCase()
    );

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Label>Favourites</Label>
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
            <span key={favourite.id} className="relative inline-flex">
              <Chip
                dot={CATEGORY_META[favourite.category as CategoryId].color}
                onClick={() => onApply(favourite)}
                className={cx(editing && 'pr-9')}
              >
                {favourite.label}
                {favourite.amount != null ? (
                  <span className="tnum text-ink-muted">
                    {formatMoney(favourite.amount, favourite.currency)}
                  </span>
                ) : null}
                {favourite.person === null ? (
                  <span className="rounded-pill bg-surface-base/50 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-ink-faint">
                    both
                  </span>
                ) : null}
              </Chip>
              {editing ? (
                <button
                  type="button"
                  onClick={() => onRemove(favourite.id)}
                  aria-label={`Remove favourite ${favourite.label}`}
                  className="pressable absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-brand-accent/15 text-caption text-brand-accent hover:bg-brand-accent/30"
                >
                  ×
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2.5 text-caption text-ink-muted">
          Nothing saved for {tab} yet — save one below, or add a suggestion.
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-caption">
        {canSaveCurrent ? (
          <>
            <button
              type="button"
              onClick={() =>
                onAdd({
                  label: current.note.trim() || CATEGORY_META[current.category].label,
                  person: tab,
                  category: current.category,
                  currency: current.currency,
                  amount: null,
                  note: current.note
                })
              }
              className="tap-target pressable px-1 font-medium text-brand-highlight hover:text-brand-amber"
            >
              + Save for {tab}
            </button>
            <button
              type="button"
              onClick={() =>
                onAdd({
                  label: current.note.trim() || CATEGORY_META[current.category].label,
                  person: null,
                  category: current.category,
                  currency: current.currency,
                  amount: null,
                  note: current.note
                })
              }
              className="tap-target pressable px-1 text-ink-muted hover:text-brand-highlight"
            >
              + Save for both
            </button>
          </>
        ) : null}
        {shown.length > 0 ? (
          <button
            type="button"
            onClick={() => setEditing((open) => !open)}
            className="tap-target pressable ml-auto px-1 text-ink-muted hover:text-brand-highlight"
          >
            {editing ? 'Done' : 'Edit'}
          </button>
        ) : null}
      </div>

      {/* Proposed from this person's own history — never added automatically.
          The household chooses its shortcuts; the app only points at patterns. */}
      {suggestions.length > 0 ? (
        <div className="mt-3 rounded-control border border-dashed border-edge bg-surface-inset/50 p-3">
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
                className="tap-target pressable inline-flex items-center gap-2 rounded-pill border border-edge px-3.5 text-caption text-ink-muted hover:border-brand-highlight hover:text-brand-highlight"
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
      ) : null}
    </div>
  );
};
