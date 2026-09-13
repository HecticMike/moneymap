import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  CATEGORY_META,
  GROUP_META,
  categoriesInGroup,
  groupOf,
  isIncome,
  type GroupId
} from '../domain/categories';
import { reviewMonth, type Comparison } from '../domain/insights';
import { formatMoney } from '../domain/money';
import { committedSpend, type RecurringSeries } from '../domain/recurring';
import type { Entry } from '../domain/types';
import { Card, CardHeader, Label, Well, cx } from './ui';

interface InsightsProps {
  entries: Entry[];
}

const percent = (value: number): string => `${Math.round(Math.abs(value) * 100)}%`;

/** Rising spend reads as a warning, falling spend as a good thing. */
const Delta: React.FC<{ comparison: Comparison; className?: string }> = ({
  comparison,
  className
}) => {
  if (comparison.samples === 0) return null;
  const up = comparison.deltaAbs > 0;

  return (
    <span
      className={cx(
        'tnum inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-caption font-semibold',
        up ? 'bg-brand-accent/12 text-brand-accent' : 'bg-brand-positive/12 text-brand-positive',
        className
      )}
    >
      <span aria-hidden>{up ? '▲' : '▼'}</span>
      {formatMoney(Math.abs(comparison.deltaAbs))}
      {comparison.deltaPct != null ? (
        <span className="opacity-70">{percent(comparison.deltaPct)}</span>
      ) : null}
    </span>
  );
};

/** Relative size communicates more here than the number does. */
const Bar: React.FC<{ share: number; color: string }> = ({ share, color }) => (
  <div className="h-1.5 overflow-hidden rounded-pill bg-surface-base/80">
    <div
      className="h-full origin-left animate-grow-x rounded-pill"
      style={{ width: `${Math.max(share * 100, 1.5)}%`, backgroundColor: color }}
    />
  </div>
);

const SeriesRow: React.FC<{ item: RecurringSeries }> = ({ item }) => (
  <li className="flex items-center gap-3 px-3.5 py-3">
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: CATEGORY_META[item.category].color }}
      aria-hidden
    />
    <div className="min-w-0 flex-1">
      <p className="truncate text-caption text-ink">{item.label}</p>
      <p className="text-micro uppercase tracking-[0.12em] text-ink-faint">
        {item.cadence}
        {item.cadence !== 'monthly' ? ` · ${formatMoney(item.typicalAmount)} each` : ''}
        {item.confidence === 'medium' ? ' · likely' : ''}
      </p>
    </div>
    <span className="tnum shrink-0 text-caption font-semibold text-ink">
      {formatMoney(item.monthlyEquivalent)}
    </span>
  </li>
);

export const Insights: React.FC<InsightsProps> = ({ entries }) => {
  const [openGroup, setOpenGroup] = useState<GroupId | null>(null);

  const review = useMemo(() => reviewMonth(entries), [entries]);
  const committed = useMemo(() => committedSpend(entries), [entries]);

  const windowLabel = `${format(review.window.start, 'd')}–${format(review.window.end, 'd MMM')}`;
  const priorMonths = review.priorWindows.map((prior) => format(prior.start, 'MMM')).reverse();
  const priorLabel =
    priorMonths.length <= 2
      ? priorMonths.join(' and ')
      : `${priorMonths[0]}–${priorMonths[priorMonths.length - 1]}`;

  const movers = review.byGroup.filter((item) => item.comparison.notable).slice(0, 4);
  const moverPeak = Math.max(1, ...movers.map((m) => Math.abs(m.comparison.deltaAbs)));

  const groupTotals = useMemo(() => {
    const totals = new Map<GroupId, number>();
    for (const entry of entries) {
      if (isIncome(entry.category)) continue;
      const group = groupOf(entry.category);
      totals.set(group, (totals.get(group) ?? 0) + entry.baseAmount);
    }
    const all = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    return { all, sum: all.reduce((running, [, value]) => running + value, 0) };
  }, [entries]);

  if (entries.length === 0) return null;

  const net = review.income.current - review.spend.current;

  return (
    <div className="space-y-4">
      <Card className="animate-rise-in">
        <CardHeader
          title="This month so far"
          aside={<span className="text-micro uppercase tracking-[0.12em] text-ink-faint">{windowLabel}</span>}
        />

        <p className="tnum mt-3 text-display font-semibold text-brand-highlight">
          {formatMoney(review.spend.current)}
        </p>

        {review.insufficientHistory ? (
          // Better to say there is not enough history than to render a
          // confident-looking comparison drawn from a single month.
          <p className="mt-2 text-caption text-ink-muted">
            Not enough history yet to say whether that is unusual — comparisons start once there
            are a couple of earlier months to look at.
          </p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Delta comparison={review.spend} />
              <span className="tnum text-caption text-ink-muted">
                vs {formatMoney(review.spend.baseline)} usual
              </span>
            </div>
            {/* The comparison is like-for-like; saying so is what makes the
                number trustworthy rather than merely impressive. */}
            <p className="mt-2 text-micro uppercase tracking-[0.12em] text-ink-faint">
              Same days of {priorLabel}
            </p>
          </>
        )}

        {review.income.current > 0 ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-control bg-surface-inset/70 px-3.5 py-3">
            <div>
              <p className="text-micro uppercase tracking-[0.12em] text-ink-faint">Income</p>
              <p className="tnum text-caption font-semibold text-ink">
                {formatMoney(review.income.current)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-micro uppercase tracking-[0.12em] text-ink-faint">Net</p>
              <p
                className={cx(
                  'tnum text-caption font-semibold',
                  net >= 0 ? 'text-brand-positive' : 'text-brand-accent'
                )}
              >
                {formatMoney(net)}
              </p>
            </div>
          </div>
        ) : null}
      </Card>

      {movers.length > 0 ? (
        <Card>
          <CardHeader title="What moved" />
          <ul className="mt-3 space-y-3.5">
            {movers.map((mover) => (
              <li key={mover.key}>
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-caption text-ink">{mover.label}</span>
                  <Delta comparison={mover.comparison} />
                </div>
                <div className="mt-2">
                  <Bar
                    share={Math.abs(mover.comparison.deltaAbs) / moverPeak}
                    color={mover.color}
                  />
                </div>
                <p className="tnum mt-1.5 text-micro uppercase tracking-[0.12em] text-ink-faint">
                  {formatMoney(mover.comparison.current)} vs {formatMoney(mover.comparison.baseline)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Where it goes"
          aside={<span className="text-micro uppercase tracking-[0.12em] text-ink-faint">All time</span>}
        />
        <p className="mt-1 text-caption text-ink-muted">Tap a group to break it down.</p>

        <div className="mt-3 space-y-2.5">
          {groupTotals.all.map(([group, value]) => {
            const open = openGroup === group;
            const share = groupTotals.sum > 0 ? value / groupTotals.sum : 0;

            return (
              <div key={group}>
                <button
                  type="button"
                  onClick={() => setOpenGroup(open ? null : group)}
                  aria-expanded={open}
                  className="pressable w-full rounded-control px-1 py-1.5 text-left hover:bg-surface-high/40"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: GROUP_META[group].color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-caption text-ink">
                      {GROUP_META[group].label}
                    </span>
                    <span className="tnum text-micro text-ink-faint">{percent(share)}</span>
                    <span className="tnum w-20 text-right text-caption font-semibold text-ink">
                      {formatMoney(value)}
                    </span>
                  </div>
                  <div className="mt-2">
                    <Bar share={share} color={GROUP_META[group].color} />
                  </div>
                </button>

                {open ? (
                  <Well className="mt-2 animate-rise-in">
                    <ul className="divide-y divide-edge/60">
                      {categoriesInGroup(group)
                        .map((categoryId) => ({
                          categoryId,
                          total: entries
                            .filter((entry) => entry.category === categoryId)
                            .reduce((sum, entry) => sum + entry.baseAmount, 0)
                        }))
                        .filter((row) => row.total > 0)
                        .sort((a, b) => b.total - a.total)
                        .map((row) => (
                          <li
                            key={row.categoryId}
                            className="flex items-center gap-2.5 px-3.5 py-2.5"
                          >
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: CATEGORY_META[row.categoryId].color }}
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1 truncate text-caption text-ink-muted">
                              {CATEGORY_META[row.categoryId].label}
                            </span>
                            <span className="tnum text-caption text-ink">
                              {formatMoney(row.total)}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </Well>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>

      {committed.committed.length > 0 || committed.habitual.length > 0 ? (
        <Card>
          <div className="flex items-baseline justify-between gap-3">
            <Label>Committed each month</Label>
            <span className="tnum text-figure font-semibold text-brand-highlight">
              {formatMoney(committed.committedTotal)}
            </span>
          </div>
          <p className="mt-1 text-caption text-ink-muted">
            Bills and subscriptions — money that leaves without a decision.
          </p>

          {committed.committed.length > 0 ? (
            <Well className="mt-3">
              <ul className="divide-y divide-edge/60">
                {committed.committed.map((item) => (
                  <SeriesRow key={item.key} item={item} />
                ))}
              </ul>
            </Well>
          ) : (
            <p className="mt-3 text-caption text-ink-muted">
              No fixed bills detected yet. They appear once a charge has repeated three times on a
              regular schedule.
            </p>
          )}

          {/* Deliberately separate. A monthly dinner is predictable, but calling
              it "committed" overstates how locked in the household is. */}
          {committed.habitual.length > 0 ? (
            <>
              <div className="mt-5 flex items-baseline justify-between gap-3 border-t border-edge pt-4">
                <Label>Regular, but a choice</Label>
                <span className="tnum text-caption font-semibold text-ink">
                  {formatMoney(committed.habitualTotal)}
                </span>
              </div>
              <p className="mt-1 text-caption text-ink-muted">
                Repeats like clockwork, but could stop.
              </p>
              <Well className="mt-3">
                <ul className="divide-y divide-edge/60">
                  {committed.habitual.map((item) => (
                    <SeriesRow key={item.key} item={item} />
                  ))}
                </ul>
              </Well>
            </>
          ) : null}

          {committed.lapsed.length > 0 ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-caption text-ink-muted hover:text-brand-highlight">
                {committed.lapsed.length} appear{committed.lapsed.length === 1 ? 's' : ''} to have
                stopped
              </summary>
              <ul className="mt-2 space-y-1 text-caption text-ink-faint">
                {committed.lapsed.map((item) => (
                  <li key={item.key}>
                    {item.label} — last seen {format(new Date(item.lastSeen), 'd MMM yyyy')}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
};
