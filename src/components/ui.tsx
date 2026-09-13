import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Shared primitives.
 *
 * v1 and the earlier slices repeated long class strings at every call site,
 * which is how a design drifts: one panel gets a different padding, one button
 * a different weight, and nothing looks deliberate any more. The decisions live
 * here once.
 */

export const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(' ');

interface CardProps {
  children: ReactNode;
  className?: string;
  /** Reduce padding for dense, list-heavy cards. */
  tight?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className, tight }) => (
  <section
    className={cx(
      'rounded-card border border-edge bg-surface-raised shadow-card',
      tight ? 'px-4 py-4' : 'px-5 py-5',
      className
    )}
  >
    {children}
  </section>
);

/**
 * Section labels. v1 set every label to `tracking-[0.3em]` at 10px, which is
 * past the point where letter-spacing helps reading. Dialled back, and used
 * only for genuine section headings so it still signals something.
 */
export const Label: React.FC<{ children: ReactNode; className?: string }> = ({
  children,
  className
}) => (
  <span
    className={cx(
      'text-micro font-semibold uppercase tracking-[0.16em] text-ink-muted',
      className
    )}
  >
    {children}
  </span>
);

export const CardHeader: React.FC<{ title: ReactNode; aside?: ReactNode }> = ({ title, aside }) => (
  <div className="flex items-center justify-between gap-3">
    <Label>{title}</Label>
    {aside}
  </div>
);

type ButtonVariant = 'primary' | 'outline' | 'quiet' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  full?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-highlight text-surface-base font-semibold hover:bg-brand-amber disabled:bg-surface-high disabled:text-ink-muted',
  outline:
    'border border-edge-strong bg-surface-high/60 text-ink hover:border-brand-highlight hover:text-brand-highlight disabled:text-ink-faint',
  quiet: 'text-ink-muted hover:text-brand-highlight disabled:text-ink-faint',
  danger: 'border border-edge text-brand-accent hover:border-brand-accent hover:bg-brand-accent/10'
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'outline',
  full,
  className,
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    className={cx(
      'tap-target pressable inline-flex items-center justify-center gap-2 rounded-control px-4 text-caption font-medium',
      // Each variant states its own disabled colours. A blanket opacity on top
      // of those made the disabled primary button almost invisible.
      'disabled:cursor-not-allowed',
      VARIANTS[variant],
      full && 'w-full',
      className
    )}
    {...rest}
  />
);

interface SegmentedProps<T extends string> {
  options: Array<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

/**
 * Segmented control. Larger targets than a native select, no platform styling
 * to fight, and the current choice is visible without opening anything.
 */
export const Segmented = <T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className
}: SegmentedProps<T>) => (
  <div
    role="group"
    aria-label={ariaLabel}
    className={cx(
      'inline-flex rounded-control border border-edge bg-surface-inset p-1',
      className
    )}
  >
    {options.map((option) => {
      const active = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={active}
          className={cx(
            // Full 44px. These segments are narrow (35-63px), so there is no
            // width to compensate for a short target — iOS gets away with 32pt
            // on segmented controls that span the screen, which these do not.
            'pressable flex-1 rounded-[7px] px-3 py-2 text-caption font-semibold',
            'min-h-[44px]',
            active
              ? 'bg-brand-highlight text-surface-base shadow-sm'
              : 'text-ink-muted hover:text-ink'
          )}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  /** Category colour, shown as a dot. */
  dot?: string;
  children: ReactNode;
}

export const Chip: React.FC<ChipProps> = ({ active, dot, children, className, ...rest }) => (
  <button
    type="button"
    aria-pressed={active}
    className={cx(
      'tap-target pressable inline-flex items-center gap-2 rounded-pill border px-3.5 text-caption font-medium',
      active
        ? 'border-brand-highlight bg-brand-highlight text-surface-base'
        : 'border-edge bg-surface-high/50 text-ink hover:border-edge-strong hover:text-brand-highlight',
      className
    )}
    {...rest}
  >
    {dot != null ? (
      <span
        className="h-2 w-2 shrink-0 rounded-full ring-1 ring-inset ring-black/20"
        style={{ backgroundColor: dot }}
        aria-hidden
      />
    ) : null}
    {children}
  </button>
);

/** A content well inside a card — lists, breakdowns, anything tabular. */
export const Well: React.FC<{ children: ReactNode; className?: string }> = ({
  children,
  className
}) => (
  <div
    className={cx(
      'overflow-hidden rounded-control border border-edge bg-surface-inset',
      className
    )}
  >
    {children}
  </div>
);

export const Divider: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cx('h-px bg-edge', className)} />
);

/** Small status pill, e.g. sync state. */
export const Badge: React.FC<{ children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' }> = ({
  children,
  tone = 'neutral'
}) => {
  const tones = {
    neutral: 'border-edge bg-surface-high/60 text-ink-muted',
    good: 'border-brand-positive/40 bg-brand-positive/10 text-brand-positive',
    warn: 'border-brand-highlight/40 bg-brand-highlight/10 text-brand-highlight',
    bad: 'border-brand-accent/40 bg-brand-accent/10 text-brand-accent'
  } as const;

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-micro font-semibold uppercase tracking-[0.12em]',
        tones[tone]
      )}
    >
      {children}
    </span>
  );
};
