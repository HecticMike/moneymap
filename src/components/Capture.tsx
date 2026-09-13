import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  CATEGORY_META,
  EXPENSE_CATEGORY_IDS,
  INCOME_CATEGORY_IDS,
  type CategoryId
} from '../domain/categories';
import { CURRENCY_META, formatMoney } from '../domain/money';
import { parseEntryText } from '../domain/parseEntry';
import { HOUSEHOLD } from '../domain/people';
import { learnNoteAssociations, suggestCategoryChips } from '../domain/suggestions';
import type { FavouriteDraft } from '../domain/favourites';
import type { CurrencyCode, Entry, Favourite } from '../domain/types';
import type { AddResult, EntryDraft } from '../hooks/useLedger';
import { Favourites } from './Favourites';

interface CaptureProps {
  entries: Entry[];
  favourites: Favourite[];
  /** Who this phone belongs to; defaults the person on new entries. */
  owner: string | null;
  onAdd: (draft: EntryDraft) => Promise<AddResult>;
  onUseFavourite: (id: string) => void;
  onAddFavourite: (draft: FavouriteDraft) => void;
  onRemoveFavourite: (id: string) => void;
}

const dayOffset = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const field =
  'tap-target w-full border border-brand-line bg-brand-midnight px-3 py-2 text-sm text-brand-highlight focus:border-brand-highlight focus:outline-none';
const label = 'text-[10px] font-semibold uppercase tracking-[0.25em] text-brand-neutral';
const chip = (active: boolean): string =>
  `tap-target border px-3 text-[11px] font-semibold transition ${
    active
      ? 'border-brand-highlight bg-brand-highlight text-brand-midnight'
      : 'border-brand-line text-brand-highlight hover:border-brand-highlight hover:text-brand-amber'
  }`;

export const Capture: React.FC<CaptureProps> = ({
  entries,
  favourites,
  owner,
  onAdd,
  onUseFavourite,
  onAddFavourite,
  onRemoveFavourite
}) => {
  const [text, setText] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('GBP');
  const [kind, setKind] = useState<'expense' | 'income'>('expense');

  // Explicit choices win over anything parsed from the text. Kept as separate
  // overrides rather than merged into one state so that continuing to type
  // never silently undoes a chip the person just tapped.
  const [categoryOverride, setCategoryOverride] = useState<CategoryId | null>(null);
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const [noteOverride, setNoteOverride] = useState<string | null>(null);
  // Defaults to whoever's phone this is — one fewer tap on the common case.
  const [person, setPerson] = useState<string>(owner ?? '');

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const learned = useMemo(() => learnNoteAssociations(entries), [entries]);
  const chips = useMemo(
    () => suggestCategoryChips(entries, { kind, limit: 6 }),
    [entries, kind]
  );
  const parsed = useMemo(() => parseEntryText(text, { learned }), [text, learned]);

  const category: CategoryId =
    categoryOverride ??
    parsed.category?.category ??
    chips[0] ??
    (kind === 'income' ? 'income_salary' : 'other');
  const date = dateOverride ?? parsed.date ?? dayOffset(0);
  const note = noteOverride ?? parsed.note;
  const amount = parsed.amount;
  const valid = amount != null && amount > 0;

  // Only worth showing when the parser understood more than a bare number.
  const showUnderstood =
    valid && (parsed.category != null || parsed.date != null || parsed.note !== '');

  const reset = () => {
    setText('');
    setCategoryOverride(null);
    setDateOverride(null);
    setNoteOverride(null);
  };

  const applyFavourite = (favourite: Favourite) => {
    onUseFavourite(favourite.id);
    setCurrency(favourite.currency);
    setCategoryOverride(favourite.category as CategoryId);
    setNoteOverride(favourite.note);
    // A shared favourite leaves the person alone; a personal one attributes the
    // entry to its owner, which is what makes logging for the other person work.
    if (favourite.person != null) setPerson(favourite.person);
    if (favourite.amount != null) setText(String(favourite.amount));
    setFeedback(null);
    setProblem(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || busy) return;

    setBusy(true);
    setProblem(null);
    setFeedback(null);

    const result = await onAdd({
      amount,
      currency,
      category,
      // Midday, so a timezone shift cannot move the entry to the day before.
      date: new Date(`${date}T12:00:00`).toISOString(),
      note,
      user: person === '' ? null : person,
      source: parsed.category != null || parsed.date != null ? 'text' : 'form'
    });

    if (!result.ok) {
      setProblem(
        `No exchange rate for ${currency} is available offline, and none is cached. Save in ${CURRENCY_META.GBP.label} or try again on a connection.`
      );
    } else {
      reset();
      setFeedback(
        result.approximateRate
          ? `Saved ${formatMoney(result.entry.baseAmount)} using the nearest available rate — correctable later.`
          : `Saved ${formatMoney(result.entry.baseAmount)}.`
      );
    }
    setBusy(false);
  };

  const options = kind === 'income' ? INCOME_CATEGORY_IDS : EXPENSE_CATEGORY_IDS;

  return (
    <form onSubmit={submit} className="border border-brand-line bg-brand-ocean/80 px-4 py-5 shadow-panel">
      <div className="flex items-center justify-between">
        <h2 className={label}>Add an entry</h2>
        <div className="flex border border-brand-line">
          {(['expense', 'income'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setKind(option);
                setCategoryOverride(null);
              }}
              aria-pressed={kind === option}
              className={`tap-target px-4 text-[10px] font-semibold uppercase tracking-[0.2em] transition ${
                kind === option
                  ? 'bg-brand-highlight text-brand-midnight'
                  : 'text-brand-highlight hover:text-brand-amber'
              }`}
            >
              {option === 'expense' ? 'Out' : 'In'}
            </button>
          ))}
        </div>
      </div>

      {/* One field for both the plain case and the fast case: "12.50" works,
          and so does "12.50 tesco yesterday". */}
      <div className="mt-3 flex items-stretch gap-2">
        <div className="flex border border-brand-line">
          {(Object.keys(CURRENCY_META) as CurrencyCode[]).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setCurrency(code)}
              aria-pressed={currency === code}
              className={`px-3 text-sm font-semibold transition ${
                currency === code
                  ? 'bg-brand-highlight text-brand-midnight'
                  : 'text-brand-highlight hover:text-brand-amber'
              }`}
            >
              {CURRENCY_META[code].symbol}
            </button>
          ))}
        </div>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          inputMode="decimal"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="12.50 tesco"
          aria-label="Amount, or amount with a description"
          className="min-w-0 flex-1 border border-brand-line bg-brand-midnight px-3 py-3 text-2xl font-semibold tabular-nums text-brand-highlight placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-brand-neutral/40 focus:border-brand-highlight focus:outline-none"
        />
      </div>

      {/* The parser is allowed to be wrong, never silently wrong. */}
      {showUnderstood ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-brand-neutral">
          <span className="font-semibold text-brand-highlight">
            {formatMoney(amount, currency)}
          </span>
          {parsed.category != null ? (
            <>
              <span aria-hidden>·</span>
              <span style={{ color: CATEGORY_META[parsed.category.category].color }}>
                {CATEGORY_META[parsed.category.category].label}
              </span>
            </>
          ) : null}
          {parsed.dateLabel != null ? (
            <>
              <span aria-hidden>·</span>
              <span>{format(new Date(`${date}T12:00:00`), 'd MMM')}</span>
            </>
          ) : null}
          {parsed.note !== '' ? (
            <>
              <span aria-hidden>·</span>
              <span className="italic">“{parsed.note}”</span>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="mt-4">
        <Favourites
          favourites={favourites}
          entries={entries}
          owner={owner}
          onApply={applyFavourite}
          onAdd={onAddFavourite}
          onRemove={onRemoveFavourite}
          current={{ category, currency, note, person: person === '' ? null : person }}
        />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <span className={label}>Category</span>
          <span className="text-[10px] uppercase tracking-[0.2em] text-brand-neutral">
            {CATEGORY_META[category].label}
          </span>
        </div>
        {/* Ranked by what this household actually uses, not a fixed list. */}
        <div className="mt-2 flex flex-wrap gap-2">
          {chips.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setCategoryOverride(id)}
              aria-pressed={category === id}
              className={chip(category === id)}
            >
              <span
                className="mr-2 inline-block h-2 w-2 align-middle"
                style={{ backgroundColor: CATEGORY_META[id].color }}
                aria-hidden
              />
              {CATEGORY_META[id].label}
            </button>
          ))}
        </div>
        <select
          value={category}
          onChange={(event) => setCategoryOverride(event.target.value as CategoryId)}
          aria-label="All categories"
          className={`${field} mt-2`}
        >
          {options.map((id) => (
            <option key={id} value={id}>
              {CATEGORY_META[id].label}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={() => setDetailsOpen((open) => !open)}
        aria-expanded={detailsOpen}
        className="tap-target mt-2 flex w-full items-center text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-neutral transition hover:text-brand-amber"
      >
        {detailsOpen ? '− Fewer options' : '+ Date, person, note'}
      </button>

      {detailsOpen ? (
        <div className="mt-3 space-y-4 border-t border-brand-line pt-4">
          <div>
            <div className="flex items-center justify-between">
              <span className={label}>Date</span>
              <div className="flex gap-1">
                {[
                  { label: 'Today', value: dayOffset(0) },
                  { label: 'Yesterday', value: dayOffset(-1) }
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => setDateOverride(option.value)}
                    aria-pressed={date === option.value}
                    className={`tap-target border px-3 text-[10px] font-semibold uppercase tracking-[0.15em] transition ${
                      date === option.value
                        ? 'border-brand-highlight text-brand-amber'
                        : 'border-brand-line text-brand-neutral hover:text-brand-amber'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="date"
              value={date}
              onChange={(event) => setDateOverride(event.target.value)}
              className={`${field} mt-1`}
            />
          </div>

          <div>
            <span className={label}>Person</span>
            <div className="mt-1 flex border border-brand-line">
              <button
                type="button"
                onClick={() => setPerson('')}
                aria-pressed={person === ''}
                className={`tap-target flex-1 px-2 text-xs font-semibold transition ${
                  person === ''
                    ? 'bg-brand-highlight text-brand-midnight'
                    : 'text-brand-highlight hover:text-brand-amber'
                }`}
              >
                Not set
              </button>
              {HOUSEHOLD.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setPerson(name)}
                  aria-pressed={person === name}
                  className={`tap-target flex-1 border-l border-brand-line px-2 text-xs font-semibold transition ${
                    person === name
                      ? 'bg-brand-highlight text-brand-midnight'
                      : 'text-brand-highlight hover:text-brand-amber'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className={label}>Note</span>
            <input
              value={note}
              onChange={(event) => setNoteOverride(event.target.value)}
              maxLength={240}
              placeholder="Optional"
              className={`${field} mt-1`}
            />
          </div>

        </div>
      ) : null}

      <button
        type="submit"
        disabled={!valid || busy}
        className="tap-target mt-5 w-full border border-brand-line bg-brand-highlight px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-midnight transition hover:bg-brand-amber disabled:cursor-not-allowed disabled:bg-brand-slate/60 disabled:text-brand-neutral/50"
      >
        {busy ? 'Saving…' : valid ? `Add ${formatMoney(amount, currency)}` : 'Add entry'}
      </button>

      {problem != null ? (
        <p className="mt-3 border border-brand-accent bg-brand-accent/10 px-3 py-2 text-[11px] text-brand-accent">
          {problem}
        </p>
      ) : null}
      {feedback != null ? <p className="mt-3 text-[11px] text-brand-positive">{feedback}</p> : null}
    </form>
  );
};
