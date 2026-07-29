import type { CSSProperties, ReactNode } from 'react';

import { useSettings } from '../state/settings';

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA: string, hexB: string): number {
  const [lighter, darker] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

// Team colors are arbitrary brand hues unrelated to the active theme, so a fixed
// text color can't guarantee legibility (e.g. white-on-amber fails badly). Pick
// whichever of black/white contrasts more against the actual fill.
const buttonStyle = (background: string): CSSProperties => {
  if (background.startsWith('#')) {
    const onWhite = contrastRatio(background, '#ffffff');
    const onBlack = contrastRatio(background, '#000000');
    return {
      '--button-color': background,
      color: onWhite >= onBlack ? '#fff' : '#000',
    } as CSSProperties;
  }
  const neutral = background.includes('surface');
  return {
    '--button-color': background,
    // Design tokens run light-on-dark-theme / dark-on-light-theme, so the page's
    // own bg color reliably contrasts against them (unlike a fixed white).
    color: neutral ? 'var(--color-text)' : 'var(--color-bg)',
  } as CSSProperties;
};

// Team brand colors span very light to very dark hues, so using one verbatim as
// running text fails contrast against a card for roughly half the league (e.g.
// #FFB300 on a white card is ~1.8:1). Diluting it with the theme's own text
// color keeps the team hue recognizable while guaranteeing legible contrast,
// and stays theme-correct automatically since color-mix resolves the var() at
// paint time.
export function teamTextColor(hex: string): string {
  return `color-mix(in srgb, ${hex} 45%, var(--color-text) 55%)`;
}

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

export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
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

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange(value: T): void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="segmented-control">
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            aria-label={option.ariaLabel ?? option.label}
            onClick={() => onChange(option.id)}
            className={`segmented-control__option${selected ? ' segmented-control__option--selected' : ''}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function StatChip({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div
      style={{
        minWidth: 76,
        padding: '6px 10px',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        background: 'var(--color-surface-raised)',
        textAlign: 'center',
      }}
    >
      <div style={{ color: 'var(--color-text-faint)', fontSize: 10, fontWeight: 700 }}>{label}</div>
      <div
        style={{
          marginTop: 2,
          color: tone ?? 'var(--color-text)',
          fontFamily: 'var(--font-display)',
          fontSize: 15,
          fontWeight: 700,
        }}
      >
        {value}
      </div>
    </div>
  );
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
  const className = ['lamp-figure', elite && 'lamp-figure--elite', compact && 'lamp-figure--sm']
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

export function TermTooltip({ term, description }: { term: string; description: string }) {
  return (
    <span className="term-tooltip" tabIndex={0} aria-label={`${term}: ${description}`}>
      <span className="term-tooltip__term">{term}</span>
      <span className="term-tooltip__bubble" role="tooltip">
        {description}
      </span>
    </span>
  );
}

/** Compact icon-only button that opens the settings sheet - replaces what used to be
 * two separate always-visible fixed pills (theme + debug toggles), which together were
 * too large/prominent on narrow phone screens. */
export function SettingsButton({ onClick }: { onClick(): void }) {
  return (
    <button type="button" className="settings-button" onClick={onClick} aria-label="設定を開く" title="設定">
      <span aria-hidden="true">⚙</span>
    </button>
  );
}

/**
 * The only way back to team selection / a fresh save once a game is underway - none of
 * the in-game screens otherwise ever navigate back to the welcome screen. Confirms first
 * since proceeding through team select will eventually autosave over the active slot.
 */
export function NewGameButton({ onStartNewGame }: { onStartNewGame(): void }) {
  const { skipConfirmations } = useSettings();
  return (
    <Button
      onClick={() => {
        if (
          skipConfirmations ||
          window.confirm(
            '新しいゲームを始めますか？現在のセーブ枠の進行状況は、新しいゲームを進めた時点で上書きされます。',
          )
        ) {
          onStartNewGame();
        }
      }}
      color="var(--color-surface-muted)"
      ariaLabel="新しいゲームを始める（チーム選択に戻る）"
    >
      新しいゲーム
    </Button>
  );
}

/**
 * Pure navigation back to the title screen - doesn't touch save data, so it needs no
 * confirmation. Lets a player review save slots (switch, export, start fresh) without
 * committing to anything; the title screen itself offers a way back into this same game.
 */
export function BackToTitleButton({ onGoToTitle }: { onGoToTitle(): void }) {
  return (
    <Button onClick={onGoToTitle} color="var(--color-surface-muted)" ariaLabel="タイトル画面へ戻る">
      タイトルへ戻る
    </Button>
  );
}
