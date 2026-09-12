import { useState } from 'react';
import { CATEGORY_META, EXPENSE_CATEGORY_IDS, INCOME_CATEGORY_IDS, type CategoryId } from '../domain/categories';
import { CURRENCY_META, parseAmount } from '../domain/money';
import { HOUSEHOLD } from '../domain/people';
import type { CurrencyCode } from '../domain/types';
import type { AddResult, EntryDraft } from '../hooks/useLedger';

interface QuickAddProps {
  onAdd: (draft: EntryDraft) => Promise<AddResult>;
}

const today = (): string => new Date().toISOString().slice(0, 10);

const field =
  'w-full border border-brand-line bg-brand-midnight px-3 py-2 text-sm text-brand-highlight focus:border-brand-highlight focus:outline-none';
const label = 'text-[10px] font-semibold uppercase tracking-[0.25em] text-brand-neutral';

/**
 * Mobile-first capture.
 *
 * v1's form was a two-column desktop grid with a 24-item category dropdown —
 * five interactions and a scroll to log a coffee one-handed. This is the same
 * fields rebuilt for a thumb; the genuinely fast paths (one-tap chips, saved
 * templates, free-text) land in slice 3 on top of this.
 */
export const QuickAdd: React.FC<QuickAddProps> = ({ onAdd }) => {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('GBP');
  const [category, setCategory] = useState<CategoryId>('living_home_supermarket');
  const [date, setDate] = useState(today);
  const [person, setPerson] = useState<string>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const parsed = parseAmount(amount);
  const valid = parsed != null && parsed > 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || busy) return;

    setBusy(true);
    setProblem(null);
    setFeedback(null);

    const result = await onAdd({
      amount: parsed,
      currency,
      category,
      date: new Date(`${date}T12:00:00`).toISOString(),
      note,
      user: person === '' ? null : person,
      source: 'form'
    });

    if (!result.ok) {
      setProblem(
        `No exchange rate available for ${currency} offline, and none cached. Save this in ${CURRENCY_META.GBP.label} or try again on a connection.`
      );
    } else {
      setAmount('');
      setNote('');
      setFeedback(
        result.approximateRate
          ? 'Saved using the nearest available rate — it can be corrected later.'
          : 'Saved.'
      );
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="border border-brand-line bg-brand-ocean/80 px-4 py-5 shadow-panel">
      <h2 className={label}>Add an entry</h2>

      <div className="mt-4 flex items-stretch gap-2">
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
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          aria-label="Amount"
          className="min-w-0 flex-1 border border-brand-line bg-brand-midnight px-3 py-3 text-2xl font-semibold tabular-nums text-brand-highlight placeholder:text-brand-neutral/40 focus:border-brand-highlight focus:outline-none"
        />
      </div>

      <label className="mt-4 block">
        <span className={label}>Category</span>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as CategoryId)}
          className={`${field} mt-1`}
        >
          <optgroup label="Expenses">
            {EXPENSE_CATEGORY_IDS.map((id) => (
              <option key={id} value={id}>
                {CATEGORY_META[id].label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Income">
            {INCOME_CATEGORY_IDS.map((id) => (
              <option key={id} value={id}>
                {CATEGORY_META[id].label}
              </option>
            ))}
          </optgroup>
        </select>
      </label>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block">
          <span className={label}>Date</span>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className={`${field} mt-1`}
          />
        </label>
        <label className="block">
          <span className={label}>Person</span>
          <select
            value={person}
            onChange={(event) => setPerson(event.target.value)}
            className={`${field} mt-1`}
          >
            <option value="">Not set</option>
            {HOUSEHOLD.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-4 block">
        <span className={label}>Note</span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={240}
          placeholder="Optional"
          className={`${field} mt-1`}
        />
      </label>

      <button
        type="submit"
        disabled={!valid || busy}
        className="mt-5 w-full border border-brand-line bg-brand-highlight px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-midnight transition hover:bg-brand-amber disabled:cursor-not-allowed disabled:bg-brand-slate/60 disabled:text-brand-neutral/50"
      >
        {busy ? 'Saving…' : 'Add entry'}
      </button>

      {problem != null ? (
        <p className="mt-3 border border-brand-accent bg-brand-accent/10 px-3 py-2 text-[11px] text-brand-accent">
          {problem}
        </p>
      ) : null}
      {feedback != null ? (
        <p className="mt-3 text-[11px] text-brand-positive">{feedback}</p>
      ) : null}
    </form>
  );
};
