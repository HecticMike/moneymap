import { useMemo, useState } from 'react';
import { CATEGORY_META, type CategoryId } from '../domain/categories';
import { suggestFavourites, type FavouriteDraft } from '../domain/favourites';
import { CURRENCY_META, formatMoney } from '../domain/money';
import { HOUSEHOLD } from '../domain/people';
import type { CurrencyCode, Entry, Favourite } from '../domain/types';

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

const label = 'text-[10px] font-semibold uppercase tracking-[0.25em] text-brand-neutral';

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
      <div className="flex items-center justify-between gap-2">
        <span className={label}>Favourites</span>
        <div className="flex border border-brand-line">
          {HOUSEHOLD.map((person) => (
            <button
              key={person}
              type="button"
              onClick={() => setTab(person)}
              aria-pressed={tab === person}
              className={`tap-target px-4 text-[10px] font-semibold uppercase tracking-[0.15em] transition ${
                tab === person
                  ? 'bg-brand-highlight text-brand-midnight'
                  : 'text-brand-highlight hover:text-brand-amber'
              }`}
            >
              {person}
            </button>
          ))}
        </div>
      </div>

      {shown.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {shown.map((favourite) => (
            <span key={favourite.id} className="flex">
              <button
                type="button"
                onClick={() => onApply(favourite)}
                className="tap-target border border-brand-line px-3 text-left text-[11px] font-semibold text-brand-highlight transition hover:border-brand-highlight hover:text-brand-amber"
              >
                <span
                  className="mr-2 inline-block h-2 w-2 align-middle"
                  style={{ backgroundColor: CATEGORY_META[favourite.category as CategoryId].color }}
                  aria-hidden
                />
                {favourite.label}
                {favourite.amount != null ? (
                  <span className="ml-2 text-brand-neutral">
                    {formatMoney(favourite.amount, favourite.currency)}
                  </span>
                ) : null}
                {favourite.person === null ? (
                  <span className="ml-2 text-[9px] uppercase tracking-[0.15em] text-brand-neutral">
                    both
                  </span>
                ) : null}
              </button>
              {editing ? (
                <button
                  type="button"
                  onClick={() => onRemove(favourite.id)}
                  aria-label={`Remove favourite ${favourite.label}`}
                  className="tap-target border border-l-0 border-brand-line px-2 text-[11px] text-brand-accent transition hover:bg-brand-accent/10"
                >
                  ×
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-brand-neutral">
          No favourites for {tab} yet. Save one below, or add a suggestion.
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
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
              className="tap-target border border-brand-line px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-highlight transition hover:text-brand-amber"
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
              className="tap-target border border-brand-line px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-neutral transition hover:text-brand-amber"
            >
              + Save for both
            </button>
          </>
        ) : null}
        {shown.length > 0 ? (
          <button
            type="button"
            onClick={() => setEditing((open) => !open)}
            className="tap-target border border-brand-line px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-neutral transition hover:text-brand-amber"
          >
            {editing ? 'Done' : 'Edit'}
          </button>
        ) : null}
      </div>

      {/* Proposed from this person's own history — never added automatically.
          The household chooses its shortcuts; the app only points at patterns. */}
      {suggestions.length > 0 ? (
        <div className="mt-3 border-t border-brand-line pt-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-brand-neutral">
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
                className="tap-target border border-dashed border-brand-line px-3 text-[11px] text-brand-neutral transition hover:border-brand-highlight hover:text-brand-amber"
              >
                + {suggestion.label}
                <span className="ml-2 text-[9px] uppercase tracking-[0.15em]">
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
