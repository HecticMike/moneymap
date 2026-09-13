import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

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

/**
 * The hairline highlight along the top edge is the detail that makes a dark
 * card look lit rather than merely filled — light falls on the top face. Cheap,
 * and it does more for the surface than another shadow would.
 */
export const Card: React.FC<CardProps> = ({ children, className, tight }) => (
  <section
    className={cx(
      'relative overflow-hidden rounded-card border border-edge bg-surface-raised shadow-card',
      'before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px',
      'before:bg-gradient-to-r before:from-transparent before:via-white/[0.09] before:to-transparent',
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

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Bottom sheet. Mobile-native shape: it rises from the bottom where the thumb
 * already is, rather than a centred dialog the hand has to reach up to.
 */
export const Sheet: React.FC<SheetProps> = ({ open, onClose, title, children }) => {
  const panel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    // Stop the page behind from scrolling with the sheet.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close settings"
        onClick={onClose}
        data-backdrop
        className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative max-h-[88vh] animate-rise-in overflow-y-auto rounded-t-[22px] border-t border-edge-strong bg-surface-raised shadow-lifted focus:outline-none"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        {/* Grab handle — signals "drag me down", and marks this as a sheet
            rather than a page. */}
        <div className="sticky top-0 z-10 bg-surface-raised/95 px-5 pb-3 pt-3 backdrop-blur">
          <div className="mx-auto h-1 w-10 rounded-pill bg-edge-strong" aria-hidden />
          <div className="mt-3 flex items-center justify-between gap-3">
            <h2 className="text-lead font-semibold text-ink">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="pressable flex h-11 w-11 items-center justify-center rounded-full bg-surface-high text-ink-muted hover:text-ink"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="space-y-6 px-5 pt-2">{children}</div>
      </div>
    </div>
  );
};

interface ConfirmButtonProps {
  onConfirm: () => void;
  label: string;
  confirmLabel?: string;
  ariaLabel: string;
  children: ReactNode;
  className?: string;
}

/**
 * Two-step delete, inline.
 *
 * `window.confirm` — which v1 used — is a jarring system modal that most people
 * dismiss without reading. Arming the button in place keeps the action next to
 * the thing it affects, and it disarms itself after a few seconds so a stray
 * tap cannot sit waiting to destroy something.
 */
export const ConfirmButton: React.FC<ConfirmButtonProps> = ({
  onConfirm,
  label,
  confirmLabel = 'Sure?',
  ariaLabel,
  children,
  className
}) => {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  if (armed) {
    return (
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => {
            setArmed(false);
            onConfirm();
          }}
          className="pressable tap-target rounded-control bg-brand-accent px-2.5 text-micro font-semibold uppercase tracking-[0.1em] text-surface-base"
        >
          {confirmLabel}
        </button>
        {/* The accessible name has to contain the visible word, or voice
            control ("tap No") cannot reach it — WCAG 2.5.3. */}
        <button
          type="button"
          onClick={() => setArmed(false)}
          aria-label="No, keep it"
          className="pressable tap-target rounded-control px-2 text-micro font-semibold uppercase tracking-[0.1em] text-ink-muted hover:text-ink"
        >
          No
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setArmed(true)}
      aria-label={`${ariaLabel}. ${label}`}
      className={cx('pressable shrink-0', className)}
    >
      {children}
    </button>
  );
};

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
