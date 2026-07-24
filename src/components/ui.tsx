import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

const THEME_KEY = 'pennant-sim-theme';
type Theme = 'dark' | 'light';

const buttonStyle = (background: string): CSSProperties => {
  const neutral = background.includes('surface');
  return {
    '--button-color': background,
    color: neutral ? 'var(--color-text)' : '#fff',
  } as CSSProperties;
};

export function PageShell({
  children,
  ariaLabel = 'ペナントシミュレーター',
}: {
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <main className="page-shell" aria-label={ariaLabel}>
      <div className="page-shell__inner">{children}</div>
    </main>
  );
}

export function Card({
  children,
  style = {},
  className = '',
  ariaLabel,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <section className={`card ${className}`.trim()} style={style} aria-label={ariaLabel}>
      {children}
    </section>
  );
}

export function SectionTitle({
  children,
  id,
}: {
  children: ReactNode;
  id?: string;
}) {
  return (
    <h2 className="section-title" id={id}>
      {children}
    </h2>
  );
}

export function Button({
  children,
  onClick,
  disabled = false,
  color = 'var(--color-accent)',
  ariaLabel,
  className = '',
}: {
  children: ReactNode;
  onClick(): void;
  disabled?: boolean;
  color?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const inferredLabel = typeof children === 'string' ? children : undefined;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel ?? inferredLabel}
      className={`ui-button ${className}`.trim()}
      style={buttonStyle(color)}
    >
      {children}
    </button>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

export function LampFigure({
  label,
  value,
  elite = false,
  compact = false,
  ariaLabel,
}: {
  label: string;
  value: ReactNode;
  elite?: boolean;
  compact?: boolean;
  ariaLabel: string;
}) {
  const className = [
    'lamp-figure',
    elite && 'lamp-figure--elite',
    compact && 'lamp-figure--sm',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className} role="img" aria-label={ariaLabel}>
      <span className="lamp-figure__label" aria-hidden="true">
        {label}
      </span>
      <span className="lamp-figure__value" aria-hidden="true">
        {value}
      </span>
    </div>
  );
}

export function TermTooltip({
  term,
  description,
}: {
  term: string;
  description: string;
}) {
  return (
    <span
      className="term-tooltip"
      tabIndex={0}
      aria-label={`${term}: ${description}`}
    >
      <span className="term-tooltip__term">{term}</span>
      <span className="term-tooltip__bubble" role="tooltip">
        {description}
      </span>
    </span>
  );
}

function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const saved = window.localStorage.getItem(THEME_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(nextTheme)}
      aria-label={`${nextTheme === 'light' ? 'ライト' : 'ダーク'}テーマに切り替える`}
      aria-pressed={theme === 'light'}
    >
      <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
      <span>{theme === 'dark' ? 'ライト' : 'ダーク'}</span>
    </button>
  );
}
