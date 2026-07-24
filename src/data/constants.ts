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

export const PLAYER_DEVELOPMENT_BALANCE = {
  careerCurve: {
    yearsToPeak: {
      farDevelopment: 8,
      development: 5,
      rapidDevelopment: 2,
      peakApproach: 0,
    },
    growthCoefficient: {
      farDevelopment: 0.06,
      development: 0.11,
      rapidDevelopment: 0.18,
      peakApproach: 0.1,
      peakWindow: 0.015,
    },
    yearsPastPeak: {
      plateau: 2,
      earlyDecline: 4,
      decline: 6,
      lateDecline: 8,
    },
    declineCoefficient: {
      earlyDecline: -0.07,
      decline: -0.13,
      lateDecline: -0.2,
      finalDecline: -0.28,
    },
    latentDevelopmentShare: 0.52,
    eliteGrowthMultiplier: 1.8,
    currentRatingDeclineScale: 0.12,
  },
  annualRandomVariation: {
    maxAbsoluteChange: 0.25,
    fallbackStep: 1,
    minimumRating: 1,
    maximumRating: 120,
  },
  awakening: {
    inSeasonBaseRate: 0.0001,
    offseasonBaseRate: 0.012,
  },
  injury: {
    participantGameRate: 0.00075,
    severityWeights: { light: 0.74, mid: 0.23, heavy: 0.03 },
    recoveryDays: {
      light: { minimum: 2, maximum: 5 },
      mid: { minimum: 8, maximum: 18 },
      heavy: { minimum: 35, maximum: 70 },
    },
    heavyPermanentLoss: {
      parameterMinimum: 1,
      parameterMaximum: 2,
      amountMinimum: 1,
      amountMaximum: 2,
    },
  },
} as const;

export const FOREIGN_PLAYER_BALANCE = {
  registeredLimit: 5,
  simultaneousHitterLimit: 3,
  marketPlayers: 20,
  marketPitchers: 8,
  originWeights: {
    アメリカ: 0.42,
    ドミニカ共和国: 0.22,
    ベネズエラ: 0.12,
    キューバ: 0.08,
    メキシコ: 0.05,
    韓国: 0.04,
    台湾: 0.04,
    その他: 0.03,
  },
  contractYearWeights: {
    oneYear: 0.62,
    twoYears: 0.28,
    threeYears: 0.1,
  },
  adaptation: {
    standardMean: 0.99,
    standardDeviation: 0.055,
    disappointmentRate: 0.12,
    disappointmentMinimum: 0.82,
    disappointmentMaximum: 0.93,
    immediateBreakthroughRate: 0.03,
    breakthroughMinimum: 1.1,
    breakthroughMaximum: 1.2,
    annualRegressionToAverage: 0.28,
    annualPerformanceShare: 0.025,
    annualVariation: 0.018,
    annualBreakthroughRate: 0.025,
    annualSetbackRate: 0.075,
    minimumFactor: 0.8,
    maximumFactor: 1.25,
  },
  contractReview: {
    renewalScoreThreshold: 58,
    mlbMinimumOvr: 90,
    mlbMaximumAge: 32,
    mlbMinimumPerformanceSignal: 0.2,
    mlbBaseRate: 0.04,
    mlbOvrRate: 0.015,
    mlbMaximumRate: 0.25,
  },
} as const;

// simAB probability model. Context multipliers intentionally stay small so player ratings remain primary.
export const AT_BAT_BALANCE = {
  strikeout: {
    baseRate: 0.16,
    velocityScale: 210,
    movementScale: 270,
    breakingBallScale: 320,
    batterContactScale: 190,
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
    velocityScale: 1500,
    movementScale: 1500,
    powerScale: 1250,
    fatigueBonus: 0.18,
    environmentMultiplier: 0.45,
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
    baseAverage: 0.298,
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
