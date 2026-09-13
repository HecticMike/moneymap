import { useState } from 'react';
import type { ChosenPoint } from '../../domain/choices';
import { formatMoney } from '../../domain/money';
import { cx } from '../ui';

interface TrendColumnsProps {
  points: ChosenPoint[];
  /** The usual level, drawn as a reference rule. Must be measured over the
   *  same span as the bars, or the rule and the columns disagree. */
  baseline: number | null;
  /** e.g. "first 13 days of each month" — says what a bar actually covers. */
  spanLabel: string;
}

/**
 * Chosen spend, month by month — the chart that answers "are we spending more?".
 *
 * **Emphasis, not categorical.** One hue: the current month in the accent, every
 * earlier month in a recessive step of the same colour. Six categorical hues
 * here would bury the one bar the reader came for.
 *
 * The baseline is a solid hairline with a direct label, so "above usual" is
 * something you *see* rather than something the app asserts. The current month
 * is drawn hollow and labelled "so far", because a part-month column beside six
 * full ones is the easiest way for a chart like this to lie.
 */
export const TrendColumns: React.FC<TrendColumnsProps> = ({ points, baseline, spanLabel }) => {
  const [showTable, setShowTable] = useState(false);
  const [active, setActive] = useState<number | null>(null);

  if (points.length < 2) return null;

  const peak = Math.max(...points.map((p) => p.chosen), baseline ?? 0, 1);
  const plotHeight = 96;
  const baselineY = baseline == null ? null : plotHeight - (baseline / peak) * plotHeight;

  return (
    <div>
      {/* The rule's label sits above the plot rather than on it: in-plot it
          collided with whichever column happened to be tallest. */}
      {baseline != null ? (
        <p className="mb-1.5 flex items-center gap-2 text-micro uppercase tracking-[0.1em] text-ink-faint">
          <span className="inline-block h-px w-4 bg-edge-strong" aria-hidden />
          Usual {formatMoney(baseline)} · {spanLabel}
        </p>
      ) : (
        <p className="mb-1.5 text-micro uppercase tracking-[0.1em] text-ink-faint">{spanLabel}</p>
      )}

      <div className="relative" style={{ height: plotHeight }}>
        {baselineY != null ? (
          // Hairline, solid — dashing would read as a projection.
          <div
            className="pointer-events-none absolute inset-x-0 h-px bg-edge-strong"
            style={{ top: baselineY }}
            aria-hidden
          />
        ) : null}

        <div className="flex h-full items-end gap-2">
          {points.map((point, index) => {
            const heightPct = Math.max((point.chosen / peak) * 100, point.chosen > 0 ? 2 : 0);
            const isCurrent = index === points.length - 1;

            return (
              <button
                key={point.month}
                type="button"
                onClick={() => setActive(active === index ? null : index)}
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
                aria-label={`${point.label}${point.partial ? ' so far' : ''}: ${formatMoney(point.chosen)}`}
                className="group relative flex h-full flex-1 items-end justify-center"
              >
                {active === index ? (
                  <span className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-control border border-edge-strong bg-surface-high px-2 py-1 text-[11px] text-ink shadow-lifted">
                    {formatMoney(point.chosen)}
                  </span>
                ) : null}

                <span
                  className={cx(
                    // Capped width, 4px rounded top, square at the baseline.
                    'w-full max-w-[24px] rounded-t-[4px] transition-[height,background-color] duration-300 ease-out',
                    point.partial
                      ? 'border-2 border-b-0 border-brand-highlight bg-brand-highlight/20'
                      : isCurrent
                        ? 'bg-brand-highlight'
                        : 'bg-ink-faint/45 group-hover:bg-ink-faint/70'
                  )}
                  style={{ height: `${heightPct}%` }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex gap-2">
        {points.map((point) => (
          <span
            key={point.month}
            className="flex-1 text-center text-[10px] uppercase tracking-[0.08em] text-ink-faint"
          >
            {point.label}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-end gap-3">
        {/* Every chart carries a table twin — the tooltip enhances, never gates. */}
        <button
          type="button"
          onClick={() => setShowTable((open) => !open)}
          className="tap-target pressable px-1 text-caption text-ink-muted hover:text-brand-highlight"
        >
          {showTable ? 'Hide numbers' : 'Numbers'}
        </button>
      </div>

      {showTable ? (
        <table className="mt-2 w-full animate-rise-in text-caption">
          <caption className="sr-only">Chosen spend by month</caption>
          <tbody>
            {points.map((point) => (
              <tr key={point.month} className="border-t border-edge/60">
                <th scope="row" className="py-1.5 text-left font-normal text-ink-muted">
                  {point.label}
                  {point.partial ? <span className="text-ink-faint"> so far</span> : null}
                </th>
                <td className="tnum py-1.5 text-right text-ink">{formatMoney(point.chosen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
};
