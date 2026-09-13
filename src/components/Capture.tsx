import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import {
  CATEGORY_META,
  EXPENSE_CATEGORY_IDS,
  INCOME_CATEGORY_IDS,
  type CategoryId
} from '../domain/categories';
import type { FavouriteDraft } from '../domain/favourites';
import { CURRENCY_META, formatMoney } from '../domain/money';
import { parseEntryInput } from '../domain/parseEntry';
import { HOUSEHOLD } from '../domain/people';
import { learnNoteAssociations, suggestCategoryChips } from '../domain/suggestions';
import type { CurrencyCode, Entry, Favourite } from '../domain/types';
import type { AddResult, EntryDraft } from '../hooks/useLedger';
import { FavouriteChips, SaveAsFavourite } from './Favourites';
import { Button, Card, Chip, Label, Segmented, cx } from './ui';

interface CaptureProps {
  entries: Entry[];
  favourites: Favourite[];
  /** Who this phone belongs to; defaults the person on new entries. */
  owner: string | null;
  /** Chosen in Settings — this screen only reports it. */
  currency: CurrencyCode;
  onAdd: (draft: EntryDraft) => Promise<AddResult>;
  onUseFavourite: (id: string) => void;
  onAddFavourite: (draft: FavouriteDraft) => void;
  onOpenSettings: () => void;
}

const dayOffset = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const field =
  'tap-target w-full rounded-control border border-edge bg-surface-inset px-3.5 py-2.5 text-body text-ink focus:border-brand-highlight focus:outline-none';

export const Capture: React.FC<CaptureProps> = ({
  entries,
  favourites,
  owner,
  currency,
  onAdd,
  onUseFavourite,
  onAddFavourite,
  onOpenSettings
}) => {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'expense' | 'income'>('expense');

  // Explicit choices win over anything parsed from the text. Kept as separate
  // overrides rather than merged into one state so that continuing to type
  // never silently undoes a chip the person just tapped.
  const [categoryOverride, setCategoryOverride] = useState<CategoryId | null>(null);
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const [noteOverride, setNoteOverride] = useState<string | null>(null);
  const [person, setPerson] = useState<string>(owner ?? '');

  /**
   * Which keyboard the amount field asks for. Numbers by default, because that
   * is what nearly every entry needs.
   */
  const [keypad, setKeypad] = useState<'number' | 'text'>('number');
  const amountRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const refocusAfterSwap = useRef(false);

  /**
   * iOS picks the keyboard when a field gains focus and will not change it
   * underneath an open one, so the swap has to end in a fresh focus.
   *
   * The two modes are different elements — an input for the amount, a textarea
   * for a sentence — so the focus cannot happen in the click handler: at that
   * point the ref still holds the element about to be unmounted. It runs in an
   * effect after the new element has mounted instead. Without this the keyboard
   * simply closes and the field has to be tapped again, which defeats the
   * point of the button.
   */
  const switchKeypad = () => {
    setKeypad(keypad === 'number' ? 'text' : 'number');
    refocusAfterSwap.current = true;
  };

  useEffect(() => {
    if (!refocusAfterSwap.current) return;
    refocusAfterSwap.current = false;

    const element = amountRef.current;
    if (element == null) return;

    element.focus();
    // Caret at the end, rather than selecting what is already typed.
    const end = element.value.length;
    element.setSelectionRange(end, end);
  }, [keypad]);

  /**
   * Grow the description box to fit what is in it. A fixed two rows clipped the
   * last line of a dictated sentence, which is exactly the text someone needs to
   * read back before saving.
   */
  useEffect(() => {
    const element = amountRef.current;
    if (element == null || keypad !== 'text') return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [text, keypad]);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const learned = useMemo(() => learnNoteAssociations(entries), [entries]);
  const chips = useMemo(() => suggestCategoryChips(entries, { kind, limit: 6 }), [entries, kind]);
  const parsed = useMemo(() => parseEntryInput(text, { learned }), [text, learned]);

  const category: CategoryId =
    categoryOverride ??
    parsed.category?.category ??
    chips[0] ??
    (kind === 'income' ? 'income_salary' : 'other');
  const date = dateOverride ?? parsed.date ?? dayOffset(0);
  const note = noteOverride ?? parsed.note;
  const amount = parsed.amount;
  const valid = amount != null && amount > 0;

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
      setKeypad('number');
      setFeedback(
        result.approximateRate
          ? `Saved ${formatMoney(result.entry.baseAmount)} at the nearest available rate.`
          : `Saved ${formatMoney(result.entry.baseAmount)}.`
      );
    }
    setBusy(false);
  };

  const options = kind === 'income' ? INCOME_CATEGORY_IDS : EXPENSE_CATEGORY_IDS;

  return (
    <Card className="animate-rise-in">
      <form onSubmit={submit}>
        <div className="flex items-center justify-between gap-3">
          <Label>Add an entry</Label>
          <Segmented
            ariaLabel="Money in or out"
            value={kind}
            onChange={(next) => {
              setKind(next);
              setCategoryOverride(null);
            }}
            options={[
              { value: 'expense', label: 'Out' },
              { value: 'income', label: 'In' }
            ]}
          />
        </div>

        {/* The amount is the hero of this screen, so it gets the weight. The
            currency sits inside the same control rather than beside it, which
            reads as one field instead of two. */}
        <div
          className={cx(
            'mt-4 flex items-stretch overflow-hidden rounded-control border bg-surface-inset transition-colors',
            valid ? 'border-brand-highlight/60 shadow-glow' : 'border-edge'
          )}
        >
          {/* An indicator, not a control — the currency is chosen in Settings,
              because it changes when the household travels rather than between
              one coffee and the next. It stays visible here so a forgotten
              switch is obvious instead of silent, and tapping it goes straight
              to where it can be changed. */}
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label={`Capturing in ${CURRENCY_META[currency].label}. Change in settings.`}
            className={cx(
              'pressable tap-target flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 border-r',
              currency === 'GBP'
                ? 'border-edge bg-surface-high/40'
                : 'border-brand-highlight/40 bg-brand-highlight/10'
            )}
          >
            <span className="text-figure font-semibold leading-none text-brand-highlight">
              {CURRENCY_META[currency].symbol}
            </span>
            <span className="text-[9px] uppercase tracking-[0.1em] text-ink-faint" aria-hidden>
              {currency}
            </span>
          </button>
          {keypad === 'number' ? (
            <input
              ref={amountRef as React.RefObject<HTMLInputElement>}
              value={text}
              onChange={(event) => setText(event.target.value)}
              inputMode="decimal"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="0.00"
              aria-label="Amount"
              // The amount is the hero of this screen, and tabular figures stop
              // it shifting as digits are typed.
              className="tnum min-w-0 flex-1 border-0 bg-transparent px-4 py-4 text-display font-semibold text-brand-highlight placeholder:text-lead placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-faint focus:outline-none"
            />
          ) : (
            /* A textarea, not an input, because the side buttons leave about
               177px and a dictated sentence is far longer than that fits on one
               line at any readable size. Wrapping shows the whole thing, which
               matters most here — dictation is exactly the case where you need
               to check what it heard. */
            <textarea
              ref={amountRef as React.RefObject<HTMLTextAreaElement>}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                // Enter should add the entry, not insert a line break.
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              rows={2}
              inputMode="text"
              autoComplete="off"
              autoCorrect="on"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="12.50 tesco yesterday"
              aria-label="Amount and description, for example 12.50 tesco yesterday"
              className="min-w-0 flex-1 resize-none overflow-hidden border-0 bg-transparent px-4 py-3.5 text-lead font-medium leading-snug text-brand-highlight placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-faint focus:outline-none"
            />
          )}

          {/* The number pad on iOS has no letters at all, so the whole
              type-a-description feature was unreachable on the phone it was
              built for. This swaps the keyboard — and because the letter
              keyboard carries the system dictation key, it is also how voice
              entry works, without depending on a speech API that is unreliable
              inside an installed PWA. */}
          <button
            type="button"
            onClick={switchKeypad}
            aria-label={
              keypad === 'number'
                ? 'Switch to the letter keyboard, for typing or dictating a description'
                : 'Switch back to the number keypad'
            }
            className={cx(
              'pressable tap-target flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 border-l',
              keypad === 'text'
                ? 'border-brand-highlight/40 bg-brand-highlight/10 text-brand-highlight'
                : 'border-edge bg-surface-high/40 text-ink-muted'
            )}
          >
            <span className="text-caption font-semibold leading-none">
              {keypad === 'number' ? 'ABC' : '123'}
            </span>
            <span className="text-[9px] uppercase tracking-[0.1em] text-ink-faint" aria-hidden>
              {keypad === 'number' ? 'say it' : 'back'}
            </span>
          </button>
        </div>

        {/* The parser is allowed to be wrong, never silently wrong. */}
        {showUnderstood ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-caption text-ink-muted">
            {parsed.category != null ? (
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-high/70 px-2.5 py-1">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: CATEGORY_META[parsed.category.category].color }}
                  aria-hidden
                />
                {CATEGORY_META[parsed.category.category].label}
              </span>
            ) : null}
            {parsed.dateLabel != null ? (
              <span className="rounded-pill bg-surface-high/70 px-2.5 py-1">
                {format(new Date(`${date}T12:00:00`), 'd MMM')}
              </span>
            ) : null}
            {parsed.note !== '' ? (
              <span className="rounded-pill bg-surface-high/70 px-2.5 py-1 italic">
                {parsed.note}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5">
          <FavouriteChips favourites={favourites} owner={owner} onApply={applyFavourite} />
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <Label>Category</Label>
            <span className="text-caption text-ink">{CATEGORY_META[category].label}</span>
          </div>

          {/* Ranked by what this household actually uses, not a fixed list. */}
          <div className="mt-2.5 flex flex-wrap gap-2">
            {chips.map((id) => (
              <Chip
                key={id}
                active={category === id}
                dot={CATEGORY_META[id].color}
                onClick={() => setCategoryOverride(id)}
              >
                {CATEGORY_META[id].label}
              </Chip>
            ))}
          </div>

          <select
            value={category}
            onChange={(event) => setCategoryOverride(event.target.value as CategoryId)}
            aria-label="All categories"
            className={cx(field, 'mt-2.5')}
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
          className="tap-target pressable mt-3 flex w-full items-center gap-2 text-caption font-medium text-ink-muted hover:text-brand-highlight"
        >
          <span
            className={cx(
              'inline-block transition-transform duration-200 ease-out',
              detailsOpen && 'rotate-90'
            )}
            aria-hidden
          >
            ›
          </span>
          Date, person, note
          {!detailsOpen && (person !== '' || note !== '' || date !== dayOffset(0)) ? (
            <span className="ml-auto truncate text-ink-faint">
              {[person, note, date !== dayOffset(0) ? format(new Date(`${date}T12:00:00`), 'd MMM') : null]
                .filter((part) => part != null && part !== '')
                .join(' · ')}
            </span>
          ) : null}
        </button>

        {detailsOpen ? (
          <div className="mt-3 animate-rise-in space-y-4 rounded-control border border-edge bg-surface-inset/60 p-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <Label>Date</Label>
                <div className="flex gap-1.5">
                  {[
                    { label: 'Today', value: dayOffset(0) },
                    { label: 'Yesterday', value: dayOffset(-1) }
                  ].map((option) => (
                    <Chip
                      key={option.label}
                      active={date === option.value}
                      onClick={() => setDateOverride(option.value)}
                      className="!px-3"
                    >
                      {option.label}
                    </Chip>
                  ))}
                </div>
              </div>
              <input
                type="date"
                value={date}
                onChange={(event) => setDateOverride(event.target.value)}
                className={cx(field, 'mt-2')}
              />
            </div>

            <div>
              <Label>Person</Label>
              <Segmented
                ariaLabel="Who this entry is for"
                className="mt-2 flex w-full"
                value={person}
                onChange={setPerson}
                options={[
                  { value: '', label: 'Not set' },
                  ...HOUSEHOLD.map((name) => ({ value: name as string, label: name }))
                ]}
              />
            </div>

            <div>
              <Label>Note</Label>
              <input
                value={note}
                onChange={(event) => setNoteOverride(event.target.value)}
                maxLength={240}
                placeholder="Optional"
                className={cx(field, 'mt-2')}
              />
            </div>
          </div>
        ) : null}

        <Button type="submit" variant="primary" full disabled={!valid || busy} className="mt-5">
          {busy ? 'Saving…' : valid ? `Add ${formatMoney(amount, currency)}` : 'Add entry'}
        </Button>

        {/* Only offered once there is a note worth naming a shortcut after. */}
        <SaveAsFavourite
          current={{ category, note }}
          favourites={favourites}
          owner={owner}
          currency={currency}
          onAdd={onAddFavourite}
        />

        {problem != null ? (
          <p className="mt-3 rounded-control border border-brand-accent/40 bg-brand-accent/10 px-3.5 py-2.5 text-caption text-brand-accent">
            {problem}
          </p>
        ) : null}
        {feedback != null ? (
          <p className="mt-3 animate-rise-in text-caption text-brand-positive">{feedback}</p>
        ) : null}
      </form>
    </Card>
  );
};
