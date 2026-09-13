import { useMemo } from 'react';
import { summariseBalance, type MonthBalance } from '../domain/balance';
import { formatMoney } from '../domain/money';
import type { Entry } from '../domain/types';
import { Card, CardHeader, cx } from './ui';

interface BalanceProps {
  entries: Entry[];
}

const rate = (value: number): string => `${Math.round(value * 100)}%`;

/**
 * The balance view: income against outgoings.
 *
 * Opt-in, and deliberately secondary. The household's priority is knowing where
 * money goes; this exists so the budget-tracker side has a home and can grow,
 * not because it is the point of the app.
 */
export const Balance: React.FC<BalanceProps> = ({ entries }) => {
  const summary = useMemo(() => summariseBalance(entries, { months: 6 }), [entries]);
  const current = summary.current;

  if (current == null || entries.length === 0) return null;

  // Bars are scaled against the largest single figure across the period, so
  // income and spend stay comparable to each other month to month.
  const peak = Math.max(
    1,
    ...summary.months.flatMap((month) => [month.income, month.spend])
  );

  const netTone = current.net >= 0 ? 'text-brand-positive' : 'text-brand-accent';

  return (
    <div className="space-y-4">
      <Card className="animate-rise-in">
        <CardHeader
          title="Balance this month"
          aside={
            current.partial ? (
              <span className="text-micro uppercase tracking-[0.12em] text-ink-faint">
                So far
              </span>
            ) : null
          }
        />

        <p className={cx('tnum mt-3 text-display font-semibold', netTone)}>
          {formatMoney(current.net)}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-control bg-surface-inset/70 px-3.5 py-3">
            <p className="text-micro uppercase tracking-[0.12em] text-ink-faint">In</p>
            <p className="tnum mt-1 text-caption font-semibold text-brand-positive">
              {formatMoney(current.income)}
            </p>
          </div>
          <div className="rounded-control bg-surface-inset/70 px-3.5 py-3">
            <p className="text-micro uppercase tracking-[0.12em] text-ink-faint">Out</p>
            <p className="tnum mt-1 text-caption font-semibold text-brand-accent">
              {formatMoney(current.spend)}
            </p>
          </div>
        </div>

        {current.savingsRate != null ? (
          <p className="mt-3 text-caption text-ink-muted">
            Keeping{' '}
            <span className={cx('tnum font-semibold', netTone)}>{rate(current.savingsRate)}</span>{' '}
            of what came in
            {summary.typicalSavingsRate != null && summary.completedMonths > 0
              ? ` · usually ${rate(summary.typicalSavingsRate)}`
              : ''}
            .
          </p>
        ) : null}

        {current.partial ? (
          // Saying so matters: a month that has had income but not yet its
          // rent looks spectacular until the 1st.
          <p className="mt-2 text-micro uppercase tracking-[0.12em] text-ink-faint">
            Month still in progress
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="Last six months"
          aside={
            summary.typicalNet != null && summary.completedMonths > 0 ? (
              <span className="tnum text-micro uppercase tracking-[0.12em] text-ink-faint">
                {formatMoney(summary.typicalNet)} typical
              </span>
            ) : null
          }
        />

        <ul className="mt-4 space-y-3.5">
          {summary.months.map((month) => (
            <MonthRow key={month.month} month={month} peak={peak} />
          ))}
        </ul>

        <p className="mt-4 text-micro uppercase tracking-[0.12em] text-ink-faint">
          Green in · red out · the current month is only part-elapsed
        </p>
      </Card>
    </div>
  );
};

const MonthRow: React.FC<{ month: MonthBalance; peak: number }> = ({ month, peak }) => (
  <li className={cx(month.partial && 'opacity-70')}>
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-caption text-ink">
        {month.label}
        {month.partial ? <span className="ml-1.5 text-ink-faint">so far</span> : null}
      </span>
      <span
        className={cx(
          'tnum text-caption font-semibold',
          month.net >= 0 ? 'text-brand-positive' : 'text-brand-accent'
        )}
      >
        {formatMoney(month.net)}
      </span>
    </div>

    {/* Two bars rather than one net bar: seeing income and spend at the same
        scale is what makes a thin margin obvious. */}
    <div className="mt-2 space-y-1">
      <div className="h-1.5 overflow-hidden rounded-pill bg-surface-base/80">
        <div
          className="h-full origin-left animate-grow-x rounded-pill bg-brand-positive"
          style={{ width: `${Math.max((month.income / peak) * 100, month.income > 0 ? 1.5 : 0)}%` }}
        />
      </div>
      <div className="h-1.5 overflow-hidden rounded-pill bg-surface-base/80">
        <div
          className="h-full origin-left animate-grow-x rounded-pill bg-brand-accent"
          style={{ width: `${Math.max((month.spend / peak) * 100, month.spend > 0 ? 1.5 : 0)}%` }}
        />
      </div>
    </div>
  </li>
);
