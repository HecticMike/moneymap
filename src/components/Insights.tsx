import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CATEGORY_META, GROUP_META, categoriesInGroup, groupOf, isIncome, type GroupId } from '../domain/categories';
import { reviewMonth, type Comparison } from '../domain/insights';
import { formatMoney } from '../domain/money';
import { committedSpend, type RecurringSeries } from '../domain/recurring';
import type { Entry } from '../domain/types';

interface InsightsProps {
  entries: Entry[];
}

const panel = 'border border-brand-line bg-brand-ocean/80 px-4 py-5 shadow-panel';
const label = 'text-[10px] font-semibold uppercase tracking-[0.25em] text-brand-neutral';

const percent = (value: number): string => `${Math.round(Math.abs(value) * 100)}%`;

/** Rising spend reads as a warning, falling spend as a good thing. */
const Delta: React.FC<{ comparison: Comparison }> = ({ comparison }) => {
  if (comparison.samples === 0) return null;
  const up = comparison.deltaAbs > 0;
  const tone = up ? 'text-brand-accent' : 'text-brand-positive';

  return (
    <span className={`text-[11px] font-semibold tabular-nums ${tone}`}>
      {up ? '▲' : '▼'} {formatMoney(Math.abs(comparison.deltaAbs))}
      {comparison.deltaPct != null ? ` · ${percent(comparison.deltaPct)}` : ''}
    </span>
  );
};

const SeriesRow: React.FC<{ item: RecurringSeries }> = ({ item }) => (
  <li className="flex items-center gap-3 px-3 py-2 text-xs">
    <span
      className="h-2.5 w-2.5 shrink-0 border border-brand-line"
      style={{ backgroundColor: CATEGORY_META[item.category].color }}
      aria-hidden
    />
    <div className="min-w-0 flex-1">
      <p className="truncate">{item.label}</p>
      <p className="text-[10px] uppercase tracking-[0.18em] text-brand-neutral">
        {item.cadence}
        {item.cadence !== 'monthly' ? ` · ${formatMoney(item.typicalAmount)} each` : ''}
        {item.confidence === 'medium' ? ' · likely' : ''}
      </p>
    </div>
    <span className="shrink-0 font-semibold tabular-nums">
      {formatMoney(item.monthlyEquivalent)}
    </span>
  </li>
);

export const Insights: React.FC<InsightsProps> = ({ entries }) => {
  const [openGroup, setOpenGroup] = useState<GroupId | null>(null);

  const review = useMemo(() => reviewMonth(entries), [entries]);
  const committed = useMemo(() => committedSpend(entries), [entries]);

  const windowLabel = `${format(review.window.start, 'd')}–${format(
    review.window.end,
    'd MMM'
  )}`;
  const priorLabel = review.priorWindows
    .map((prior) => format(prior.start, 'MMM'))
    .reverse()
    .join(', ');

  // Only groups that moved enough to be worth a person's attention.
  const movers = review.byGroup.filter((item) => item.comparison.notable).slice(0, 4);

  const groupTotals = useMemo(() => {
    const totals = new Map<GroupId, number>();
    for (const entry of entries) {
      if (isIncome(entry.category)) continue;
      const group = groupOf(entry.category);
      totals.set(group, (totals.get(group) ?? 0) + entry.baseAmount);
    }
    const all = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const sum = all.reduce((running, [, value]) => running + value, 0);
    return { all, sum };
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <div className="space-y-4">
      <section className={panel}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className={label}>This month so far</h2>
          <span className="text-[10px] uppercase tracking-[0.2em] text-brand-neutral">
            {windowLabel}
          </span>
        </div>

        <p className="mt-3 text-3xl font-semibold tabular-nums">
          {formatMoney(review.spend.current)}
        </p>

        {review.insufficientHistory ? (
          // Better to say there is not enough history than to render a
          // confident-looking comparison drawn from one month.
          <p className="mt-2 text-[11px] text-brand-neutral">
            Not enough history yet to say whether that is unusual. Comparisons start once
            there are a couple of earlier months to look at.
          </p>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Delta comparison={review.spend} />
              <span className="text-[11px] text-brand-neutral">
                vs {formatMoney(review.spend.baseline)} usual
              </span>
            </div>
            {/* The comparison is like-for-like; saying so is what makes the
                number trustworthy rather than merely impressive. */}
            <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-brand-neutral/80">
              Same days of {priorLabel}
            </p>
          </>
        )}

        {review.income.current > 0 ? (
          <p className="mt-4 border-t border-brand-line pt-3 text-[11px] text-brand-neutral">
            Income this month{' '}
            <span className="font-semibold text-brand-positive">
              {formatMoney(review.income.current)}
            </span>
            {review.spend.current > 0 ? (
              <>
                {' · '}net{' '}
                <span
                  className={`font-semibold ${
                    review.income.current - review.spend.current >= 0
                      ? 'text-brand-positive'
                      : 'text-brand-accent'
                  }`}
                >
                  {formatMoney(review.income.current - review.spend.current)}
                </span>
              </>
            ) : null}
          </p>
        ) : null}
      </section>

      {movers.length > 0 ? (
        <section className={panel}>
          <h2 className={label}>What moved</h2>
          <ul className="mt-3 divide-y divide-brand-line border border-brand-line bg-brand-midnight/30">
            {movers.map((mover) => (
              <li key={mover.key} className="flex items-center gap-3 px-3 py-3 text-xs">
                <span
                  className="h-2.5 w-2.5 shrink-0 border border-brand-line"
                  style={{ backgroundColor: mover.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate">{mover.label}</p>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-brand-neutral">
                    {formatMoney(mover.comparison.current)} vs{' '}
                    {formatMoney(mover.comparison.baseline)}
                  </p>
                </div>
                <Delta comparison={mover.comparison} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={panel}>
        <h2 className={label}>Where it goes</h2>
        <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-brand-neutral">
          All time · tap a group to break it down
        </p>
        <ul className="mt-3 divide-y divide-brand-line border border-brand-line bg-brand-midnight/30">
          {groupTotals.all.map(([group, value]) => {
            const open = openGroup === group;
            const share = groupTotals.sum > 0 ? value / groupTotals.sum : 0;

            return (
              <li key={group}>
                <button
                  type="button"
                  onClick={() => setOpenGroup(open ? null : group)}
                  aria-expanded={open}
                  className="tap-target flex w-full items-center gap-3 px-3 text-left text-xs transition hover:bg-brand-midnight/40"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 border border-brand-line"
                    style={{ backgroundColor: GROUP_META[group].color }}
                    aria-hidden
                  />
                  <span className="flex-1 truncate">{GROUP_META[group].label}</span>
                  <span className="tabular-nums text-brand-neutral">{percent(share)}</span>
                  <span className="w-20 text-right font-semibold tabular-nums">
                    {formatMoney(value)}
                  </span>
                </button>

                {/* A bar is worth more than the number here — relative size is
                    the thing being communicated. */}
                <div className="mx-3 mb-2 h-0.5 bg-brand-line">
                  <div
                    className="h-full"
                    style={{ width: `${Math.max(share * 100, 1)}%`, backgroundColor: GROUP_META[group].color }}
                  />
                </div>

                {open ? (
                  <ul className="border-t border-brand-line bg-brand-midnight/50 px-3 py-2">
                    {categoriesInGroup(group)
                      .map((category) => ({
                        category,
                        total: entries
                          .filter((entry) => entry.category === category)
                          .reduce((sum, entry) => sum + entry.baseAmount, 0)
                      }))
                      .filter((row) => row.total > 0)
                      .sort((a, b) => b.total - a.total)
                      .map((row) => (
                        <li
                          key={row.category}
                          className="flex items-center gap-2 py-1 text-[11px] text-brand-neutral"
                        >
                          <span
                            className="h-1.5 w-1.5 shrink-0"
                            style={{ backgroundColor: CATEGORY_META[row.category].color }}
                            aria-hidden
                          />
                          <span className="flex-1 truncate">{CATEGORY_META[row.category].label}</span>
                          <span className="tabular-nums">{formatMoney(row.total)}</span>
                        </li>
                      ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {committed.committed.length > 0 || committed.habitual.length > 0 ? (
        <section className={panel}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className={label}>Committed each month</h2>
            <span className="text-lg font-semibold tabular-nums">
              {formatMoney(committed.committedTotal)}
            </span>
          </div>
          <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-brand-neutral">
            Bills and subscriptions — money that leaves without a decision
          </p>

          {committed.committed.length > 0 ? (
            <ul className="mt-3 divide-y divide-brand-line border border-brand-line bg-brand-midnight/30">
              {committed.committed.map((item) => (
                <SeriesRow key={item.key} item={item} />
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[11px] text-brand-neutral">
              No fixed bills detected yet. They appear once a charge has repeated three times on a
              regular schedule.
            </p>
          )}

          {/* Deliberately separate. A monthly dinner is predictable, but calling
              it "committed" overstates how locked in the household is. */}
          {committed.habitual.length > 0 ? (
            <>
              <div className="mt-5 flex items-baseline justify-between gap-3 border-t border-brand-line pt-4">
                <h3 className={label}>Regular, but a choice</h3>
                <span className="font-semibold tabular-nums">
                  {formatMoney(committed.habitualTotal)}
                </span>
              </div>
              <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-brand-neutral">
                Repeats like clockwork, but could stop
              </p>
              <ul className="mt-3 divide-y divide-brand-line border border-brand-line bg-brand-midnight/30">
                {committed.habitual.map((item) => (
                  <SeriesRow key={item.key} item={item} />
                ))}
              </ul>
            </>
          ) : null}

          {committed.lapsed.length > 0 ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-[10px] uppercase tracking-[0.18em] text-brand-neutral">
                {committed.lapsed.length} appear{committed.lapsed.length === 1 ? 's' : ''} to have
                stopped
              </summary>
              <ul className="mt-2 space-y-1 text-[11px] text-brand-neutral">
                {committed.lapsed.map((item) => (
                  <li key={item.key}>
                    {item.label} — last seen {format(new Date(item.lastSeen), 'd MMM yyyy')}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}
    </div>
  );
};
