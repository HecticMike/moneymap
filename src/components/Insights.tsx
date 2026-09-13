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
import { chosenByMonth, reviewChoices, type ChoiceLine } from '../domain/choices';
import { Sparkline } from './charts/Sparkline';
import { TrendColumns } from './charts/TrendColumns';
import {
  RANGES,
  entryInWindow,
  incomeIn,
  rangeWindow,
  reviewMonth,
  type Comparison,
  type RangeId
} from '../domain/insights';
import { formatMoney } from '../domain/money';
import { committedSpend, type RecurringSeries } from '../domain/recurring';
import type { Entry } from '../domain/types';
import { Card, CardHeader, Label, Well, cx } from './ui';

interface InsightsProps {
  entries: Entry[];
  /**
   * In spending mode the insights ignore income entirely — that is the point
   * of the mode. The balance view renders income properly in its own card
   * rather than as a footnote here.
   */
  showIncome: boolean;
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

const Bar: React.FC<{ share: number; color: string; className?: string }> = ({
  share,
  color,
  className
}) => (
  <div className={cx('h-1.5 overflow-hidden rounded-pill bg-surface-base/80', className)}>
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

const ChoiceRow: React.FC<{ line: ChoiceLine }> = ({ line }) => (
  <li>
    <div className="flex items-center gap-3">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: line.color }}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate text-caption text-ink">{line.label}</span>
      {/* Six months inline: whether this is drifting, not just whether this
          month was odd. */}
      <Sparkline points={line.trend} color={line.color} label={line.label} />
      <span className="tnum w-20 text-right text-caption font-semibold text-ink">
        {formatMoney(line.amount)}
      </span>
    </div>
    <div className="mt-1 flex items-center gap-3">
      <span className="tnum w-[18px] shrink-0 text-micro text-ink-faint">
        {percent(line.share)}
      </span>
      <div className="min-w-0 flex-1">
        <Bar share={line.share} color={line.color} />
      </div>
    </div>
    {line.couldFree != null ? (
      // The same number as the delta, framed as a lever rather than a scolding.
      <p className="tnum mt-1.5 text-micro text-brand-highlight">
        Back to usual would free {formatMoney(line.couldFree)}
      </p>
    ) : line.comparison.notable ? (
      <p className="tnum mt-1.5 text-micro text-brand-positive">
        {formatMoney(Math.abs(line.comparison.deltaAbs))} less than usual
      </p>
    ) : null}
  </li>
);

export const Insights: React.FC<InsightsProps> = ({ entries, showIncome }) => {
  const [openGroup, setOpenGroup] = useState<GroupId | null>(null);
  const [range, setRange] = useState<RangeId>('3m');

  const choices = useMemo(() => reviewChoices(entries), [entries]);
  const trend = useMemo(() => chosenByMonth(entries, { months: 6 }), [entries]);
  const month = useMemo(() => reviewMonth(entries), [entries]);
  const committed = useMemo(() => committedSpend(entries), [entries]);

  const windowLabel = `${format(choices.window.start, 'd')}–${format(choices.window.end, 'd MMM')}`;
  const priorMonths = choices.priorWindows.map((prior) => format(prior.start, 'MMM')).reverse();
  const priorLabel =
    priorMonths.length <= 2
      ? priorMonths.join(' and ')
      : `${priorMonths[0]}–${priorMonths[priorMonths.length - 1]}`;

  // Period-scoped, unlike the all-time version this replaces: an all-time
  // breakdown is dominated by rent on day one and only gets less useful.
  const scoped = useMemo(() => {
    const window = rangeWindow(new Date(), range);
    const totals = new Map<GroupId, number>();

    for (const entry of entries) {
      if (isIncome(entry.category)) continue;
      if (!entryInWindow(entry, window)) continue;
      const group = groupOf(entry.category);
      totals.set(group, (totals.get(group) ?? 0) + entry.baseAmount);
    }

    const all = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    return {
      window,
      all,
      sum: all.reduce((running, [, value]) => running + value, 0),
      income: incomeIn(entries, window)
    };
  }, [entries, range]);

  if (entries.length === 0) return null;

  const totalThisMonth = choices.chosen.current + choices.committed.current;

  return (
    <div className="space-y-4">
      {/* The headline is choices, not total spend. Rent was going out whatever
          anyone did; reporting it as the number invites "where does the money
          go?", whose honest answer is "rent, forever". */}
      <Card className="animate-rise-in">
        <CardHeader
          title="What you chose"
          aside={
            <span className="text-micro uppercase tracking-[0.12em] text-ink-faint">
              {windowLabel}
            </span>
          }
        />

        <p className="tnum mt-3 text-display font-semibold text-brand-highlight">
          {formatMoney(choices.chosen.current)}
        </p>

        {choices.insufficientHistory ? (
          <p className="mt-2 text-caption text-ink-muted">
            Not enough history yet to say whether that is unusual — comparisons start once there
            are a couple of earlier months to look at.
          </p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Delta comparison={choices.chosen} />
              <span className="tnum text-caption text-ink-muted">
                vs {formatMoney(choices.chosen.baseline)} usual
              </span>
            </div>
            <p className="mt-2 text-micro uppercase tracking-[0.12em] text-ink-faint">
              Same days of {priorLabel}
            </p>
          </>
        )}

        {/* The chart that actually answers the question. Emphasis form: this
            month in the accent, the rest recessive, the usual level drawn as a
            rule you can see rather than a number the app asserts. */}
        {trend.length >= 2 ? (
          <div className="mt-5">
            <TrendColumns
              points={trend}
              baseline={choices.insufficientHistory ? null : choices.chosen.baseline}
              spanLabel={`first ${choices.window.throughDayOfMonth} days of each month`}
            />
          </div>
        ) : null}

        <div className="mt-4 rounded-control bg-surface-inset/70 px-3.5 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-caption text-ink-muted">Already spoken for</span>
            <span className="tnum text-caption font-semibold text-ink">
              {formatMoney(choices.committed.current)}
            </span>
          </div>
          <p className="mt-1 text-micro text-ink-faint">
            Rent, bills and subscriptions. {formatMoney(totalThisMonth)} out in total.
          </p>
        </div>

        {showIncome && month.income.current > 0 ? (
          <p className="mt-3 text-caption text-ink-muted">
            Income {formatMoney(month.income.current)} ·{' '}
            <span
              className={cx(
                'font-semibold',
                month.income.current - totalThisMonth >= 0
                  ? 'text-brand-positive'
                  : 'text-brand-accent'
              )}
            >
              {formatMoney(month.income.current - totalThisMonth)} net
            </span>
          </p>
        ) : null}
      </Card>

      {choices.lines.length > 0 ? (
        <Card>
          <CardHeader title="Where the choices went" />
          <p className="mt-1 text-caption text-ink-muted">
            Share of what you decided this month — obligations excluded.
          </p>
          <ul className="mt-4 space-y-4">
            {choices.lines.slice(0, 8).map((line) => (
              <ChoiceRow key={line.category} line={line} />
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label>Where it goes</Label>
          <div className="flex gap-1 rounded-pill border border-edge bg-surface-inset p-1">
            {RANGES.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setRange(option.id)}
                aria-pressed={range === option.id}
                className={cx(
                  'pressable min-h-[44px] min-w-[44px] rounded-pill px-2 text-micro font-semibold tracking-[0.06em]',
                  range === option.id
                    ? 'bg-brand-highlight text-surface-base'
                    : 'text-ink-faint hover:text-ink'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-caption text-ink-muted">
          Everything, obligations included. Tap a group to break it down.
        </p>

        {scoped.all.length === 0 ? (
          <p className="mt-3 text-caption text-ink-faint">Nothing logged in this period.</p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {scoped.all.map(([group, value]) => {
              const open = openGroup === group;
              const share = scoped.sum > 0 ? value / scoped.sum : 0;

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
                    <Bar className="mt-2" share={share} color={GROUP_META[group].color} />
                  </button>

                  {open ? (
                    <Well className="mt-2 animate-rise-in">
                      <ul className="divide-y divide-edge/60">
                        {categoriesInGroup(group)
                          .map((categoryId) => ({
                            categoryId,
                            total: entries
                              .filter(
                                (entry) =>
                                  entry.category === categoryId &&
                                  entryInWindow(entry, scoped.window)
                              )
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
        )}
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
