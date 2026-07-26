import type { SVGProps } from 'react';

import type { SeasonTitleId } from '../engine';

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * Shared stroke-icon shell: 24x24 viewBox, round caps/joins, currentColor —
 * every icon in this file inherits its color from the surrounding text/tone
 * class instead of hardcoding a fill, so they follow dark/light theme and
 * the existing status-badge tone colors automatically.
 */
function IconBase({ size = 16, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** 好調 — condition trending up. */
export function IconTrendUp(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 16 L10 10 L14 14 L20 6" />
      <path d="M14 6 H20 V12" />
    </IconBase>
  );
}

/** 不調 — condition trending down. */
export function IconTrendDown(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 8 L10 14 L14 10 L20 18" />
      <path d="M14 18 H20 V12" />
    </IconBase>
  );
}

/** 故障 — injury / medical cross. */
export function IconMedicalCross(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8 V16 M8 12 H16" />
    </IconBase>
  );
}

/** 成長中 / 成長(notice) — sparkle, a small breakthrough. */
export function IconSparkle(props: IconProps) {
  return (
    <IconBase {...props} strokeLinejoin="round">
      <path d="M12 3 L14 10 L21 12 L14 14 L12 21 L10 14 L3 12 L10 10 Z" />
    </IconBase>
  );
}

/** 覚醒(notice) — a bolt for a sudden breakthrough, distinct from steady growth. */
export function IconBolt(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M13 2 L5 14 H11 L10 22 L19 9 H13 Z" strokeLinejoin="round" />
    </IconBase>
  );
}

/** 試合結果(notice) — a baseball. */
export function IconBaseball(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M6 6 C9 9 9 15 6 18" />
      <path d="M18 6 C15 9 15 15 18 18" />
    </IconBase>
  );
}

/** チーム情報(notice) — a megaphone for general announcements. */
export function IconMegaphone(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 10 V14 H6 L14 18 V6 L6 10 Z" strokeLinejoin="round" />
      <path d="M17 9 A5 5 0 0 1 17 15" />
    </IconBase>
  );
}

/** 首位打者 — batting average title, a bat. */
export function IconBat(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 19 L15 9" />
      <path d="M14 8 A2.6 2.6 0 1 1 19 10.6" strokeLinejoin="round" />
      <path d="M4 20 L5 19 L6 20 L5 21 Z" strokeLinejoin="round" />
    </IconBase>
  );
}

/** 最多安打 — most-hits title, a target. */
export function IconTarget(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

/** 本塁打王 — home-run title, a ball taking flight. */
export function IconHomeRun(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="15" r="5" />
      <path d="M7 13 C8.5 14.5 9.5 14.5 11 13" />
      <path d="M16 8 L18 6 M18 4 V8 H22" />
    </IconBase>
  );
}

/** 打点王 — RBI title, home plate. */
export function IconHomePlate(props: IconProps) {
  return (
    <IconBase {...props} strokeLinejoin="round">
      <path d="M5 5 H16 L20 12 L16 19 H5 Z" />
    </IconBase>
  );
}

/** 盗塁王 — stolen-base title, a base with a motion streak. */
export function IconStolenBase(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="8" y="12" width="8" height="8" rx="1.4" transform="rotate(45 12 16)" />
      <path d="M2 9 H10 M6 5 L10 9 L6 13" />
    </IconBase>
  );
}

/** 最優秀防御率 — best-ERA title, a shield. */
export function IconShield(props: IconProps) {
  return (
    <IconBase {...props} strokeLinejoin="round">
      <path d="M12 3 L19 6 V11 C19 16 16 19.5 12 21 C8 19.5 5 16 5 11 V6 Z" />
    </IconBase>
  );
}

/** 最多勝利 — wins title, a trophy. */
export function IconTrophy(props: IconProps) {
  return (
    <IconBase {...props} strokeLinejoin="round">
      <path d="M7 4 H17 V9 A5 5 0 0 1 7 9 Z" />
      <path d="M7 5 H4 V7 A3 3 0 0 0 7 10" />
      <path d="M17 5 H20 V7 A3 3 0 0 1 17 10" />
      <path d="M12 14 V17 M9 20 H15 M9 17 H15 V20 H9 Z" />
    </IconBase>
  );
}

/** 最多奪三振 — strikeouts title, the baseball K. */
export function IconStrikeout(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7 4 V20 M7 12 L15 4 M7 12 L15 20" />
    </IconBase>
  );
}

/** 最多セーブ — saves title, a lock. */
export function IconLock(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11 V7 A4 4 0 0 1 16 7 V11" />
    </IconBase>
  );
}

/** 最優秀中継ぎ — best-reliever title, a hand-off between two arrows. */
export function IconRelay(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 8 H11 M8 5 L11 8 L8 11" />
      <path d="M13 16 H21 M18 13 L21 16 L18 19" />
    </IconBase>
  );
}

const TITLE_ICONS: Record<SeasonTitleId, (props: IconProps) => React.JSX.Element> = {
  battingAverage: IconBat,
  hits: IconTarget,
  homeRuns: IconHomeRun,
  runsBattedIn: IconHomePlate,
  stolenBases: IconStolenBase,
  earnedRunAverage: IconShield,
  wins: IconTrophy,
  strikeouts: IconStrikeout,
  saves: IconLock,
  holds: IconRelay,
};

/** Icon component for a season title category (首位打者/本塁打王/etc.). */
export function TitleIcon({ titleId, ...props }: IconProps & { titleId: SeasonTitleId }) {
  const Icon = TITLE_ICONS[titleId];
  return <Icon {...props} />;
}
