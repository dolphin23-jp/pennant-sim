import type { Maturity } from '../engine/types';

export const PITCH_TYPES = [
  '直球',
  'スライダー',
  'カーブ',
  'フォーク',
  'チェンジアップ',
  'シュート',
  'カットボール',
  'シンカー',
] as const;
export const MATURITY_TYPES: Maturity[] = ['超早熟', '早熟', '通常', '晩成', '超晩成'];
export const MATURITY_PEAK_AGE: Record<Maturity, number> = {
  超早熟: 22,
  早熟: 24,
  通常: 27,
  晩成: 30,
  超晩成: 33,
};
export const MATURITY_WEIGHTS = [0.08, 0.18, 0.44, 0.18, 0.12];

// simAB probability model. Context multipliers intentionally stay small so player ratings remain primary.
export const AT_BAT_BALANCE = {
  strikeout: {
    baseRate: 0.205,
    velocityScale: 210,
    movementScale: 270,
    breakingBallScale: 320,
    batterContactScale: 220,
    fatiguePenalty: 0.26,
    minRate: 0.07,
    maxRate: 0.52,
  },
  walk: {
    baseRate: 0.068,
    controlScale: 750,
    disciplineScale: 750,
    fatigueBonus: 0.16,
    minRate: 0.018,
    maxRate: 0.16,
  },
  hitByPitch: { baseRate: 0.009, fatigueBonus: 0.004, minRate: 0.004, maxRate: 0.022 },
  homeRun: {
    baseRate: 0.028,
    velocityScale: 470,
    movementScale: 470,
    powerScale: 295,
    fatigueBonus: 0.18,
    environmentMultiplier: 0.31,
    minRate: 0.001,
    maxRate: 0.04,
  },
  groundBall: {
    baseRate: 0.462,
    singleShare: 0.82,
    doublePlayShare: 0.1,
  },
  airBall: {
    tripleShare: 0.02,
    doubleShare: 0.2,
  },
  ballsInPlay: {
    baseAverage: 0.292,
    speedScale: 1600,
    contactScale: 1500,
    minAverage: 0.22,
    maxAverage: 0.36,
  },
  platoon: {
    batterAdvantageMultiplier: 1.018,
    pitcherAdvantageMultiplier: 0.982,
  },
  familiarity: {
    perPriorMatchup: 0.004,
    maxMultiplier: 1.016,
  },
  catcherLead: { baseMultiplier: 0.86, ratingShare: 0.14, fallbackMultiplier: 0.93 },
  mastery: { baseMultiplier: 0.92, ratingShare: 0.08, defaultMastery: 0.75 },
} as const;
