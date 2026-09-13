import { useId } from 'react';
import type { ChosenPoint } from '../../domain/choices';

interface SparklineProps {
  points: ChosenPoint[];
  /** The category's colour, used only for the end marker. */
  color: string;
  label: string;
  width?: number;
  height?: number;
}

/**
 * Six months of one category, inline beside its row.
 *
 * A single series, so there is no legend and no categorical-colour problem:
 * the line is the de-emphasis ink and only the final point wears the category
 * colour. That follows the stat-tile contract — trend in the de-emphasis hue,
 * current period in the accent — and it means the eye lands on *now* rather
 * than on a stripe of colour with no reference.
 *
 * This is the piece that answers "is this creeping up?", which a single
 * month-versus-average number cannot.
 */
export const Sparkline: React.FC<SparklineProps> = ({
  points,
  color,
  label,
  width = 72,
  height = 24
}) => {
  const clipId = useId();
  if (points.length < 2) return null;

  const values = points.map((point) => point.chosen);
  const max = Math.max(...values);
  const min = Math.min(...values);
  // A flat series should sit on the centre line, not collapse onto the floor.
  const span = max - min || Math.max(max, 1);

  const padding = 3;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const coords = points.map((point, index) => ({
    x: padding + (index / (points.length - 1)) * innerWidth,
    y: padding + innerHeight - ((point.chosen - min) / span) * innerHeight,
    point
  }));

  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1]!;

  const summary = points.map((p) => `${p.label} ${Math.round(p.chosen)}`).join(', ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${label}, last ${points.length} months: ${summary}`}
      className="shrink-0 overflow-visible"
    >
      <defs>
        {/* The wash stops at the line, never above it. */}
        <clipPath id={clipId}>
          <rect x="0" y="0" width={width} height={height} />
        </clipPath>
      </defs>

      <path
        d={`${path} L${last.x.toFixed(1)} ${height} L${coords[0]!.x.toFixed(1)} ${height} Z`}
        fill={color}
        opacity="0.1"
        clipPath={`url(#${clipId})`}
      />
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-ink-faint"
      />

      {/* >=8px marker with a 2px surface ring, so it stays legible where it
          crosses the line or sits near the edge. */}
      <circle cx={last.x} cy={last.y} r="4.5" fill="var(--surface-inset, #080b1c)" />
      <circle cx={last.x} cy={last.y} r="3" fill={color} />
    </svg>
  );
};
