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
    chronologicalDecline: {
      startAge: 34,
      linearPerYear: 0.11,
      quadraticPerYear: 0.02,
      maximumMultiplier: 2.4,
    },
    latentDevelopmentShare: 0.52,
    eliteGrowthMultiplier: 1.8,
    generationalGrowthMultiplier: 2.1,
    currentRatingDeclineScale: 0.12,
  },
  annualRandomVariation: {
    maxAbsoluteChange: 0.25,
    fallbackStep: 1,
    minimumRating: 1,
    maximumRating: 130,
  },
  // Ceilings generatePotential() clamps a rolled potential to. Raised alongside
  // maximumRating above so a player can still be developed all the way up to their
  // potential once the in-career growth ceiling moves; the per-stat generation
  // formulas themselves are untouched.
  potentialCeiling: {
    standard: 135,
    elite: 150,
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

// Position-conversion practice: a batter can be pointed at an unfamiliar position and
// picks up aptitude there gradually, offseason by offseason, instead of it being fixed
// forever at generation. Kept short of a lifelong specialist's ceiling on purpose - it
// makes the player usable there, not their new best position.
export const POSITION_CONVERSION_BALANCE = {
  startingAptitude: { minimum: 15, maximum: 28 },
  ceiling: 80,
  annualGain: { minimum: 3, maximum: 9 },
  ageFactor: { young: 1.3, prime: 1, veteran: 0.7, late: 0.45 },
  ageThresholds: { young: 24, prime: 28, veteran: 32 },
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

export const PITCHER_USAGE_BALANCE = {
  fatigue: {
    recoveryPerCalendarDay: 16,
    /** 鉄人: each level speeds up how fast a pitcher sheds fatigue. */
    ironRecoveryPerLevel: 0.09,
    maximumSelectable: 65,
    emergencyMaximum: 96,
    selectionPenaltyPerPoint: 1.25,
    consecutiveAppearancePenalty: 12,
    starterBaseLoad: 10,
    starterPitchLoad: 0.85,
    relieverBaseLoad: 18,
    relieverPitchLoad: 2,
    closerBaseLoad: 20,
    closerPitchLoad: 2,
    staminaLoadAdjustment: 0.0035,
    minimumStaminaMultiplier: 0.78,
    maximumStaminaMultiplier: 1.18,
  },
  pitchCount: {
    starterBase: 76,
    starterStaminaShare: 0.34,
    starterVariation: 10,
    relieverBase: 10,
    relieverStaminaShare: 0.08,
    relieverVariation: 6,
    closerBase: 9,
    closerStaminaShare: 0.08,
    closerVariation: 4,
  },
  strikeoutTail: {
    ratingDeltaSoftness: 45,
    ratingEffectSoftness: 0.16,
    maximumRatingEffect: 0.045,
  },
} as const;

// Defence: who fields a batted ball, how well, and how often they misplay it.
// Error rates are set so a team commits roughly 80-100 errors over a 143-game season,
// which is the NPB norm (a fielding percentage a shade under .985).
export const FIELDING_BALANCE = {
  defaultDefenseScore: 50,
  /** Share of up-the-middle ground balls the pitcher fields himself. */
  pitcherGroundBallShare: 0.22,
  /** Playing out of position costs range; scales the aptitude shortfall into rating points. */
  outOfPositionPenaltyScale: 34,
  strongArmPerLevel: 4,
  errorBaseRate: {
    ground: 0.035,
    line: 0.016,
    fly: 0.005,
    popup: 0.008,
  },
  pitcherErrorFactor: 0.7,
  errorDefenseScale: 130,
  minErrorRate: 0.001,
  maxErrorRate: 0.12,
} as const;

// simAB probability model. Context multipliers intentionally stay small so player ratings remain primary.
export const AT_BAT_BALANCE = {
  strikeout: {
    baseRate: 0.22,
    velocityScale: 210,
    movementScale: 270,
    breakingBallScale: 320,
    batterContactScale: 190,
    fatiguePenalty: 0.26,
    minRate: 0.07,
    maxRate: 0.34,
  },
  walk: {
    baseRate: 0.068,
    controlScale: 2000,
    disciplineScale: 1100,
    fatigueBonus: 0.16,
    minRate: 0.018,
    maxRate: 0.16,
  },
  hitByPitch: { baseRate: 0.009, fatigueBonus: 0.004, minRate: 0.004, maxRate: 0.022 },
  // Stage 2 — what kind of ball was hit. Shares are the league-average mix before the
  // pitcher's and batter's tendencies move them; NPB sits near 45% grounders, 20% liners,
  // 27% fly balls and 8% pop-ups.
  battedBall: {
    shares: { ground: 0.45, line: 0.2, fly: 0.27, popup: 0.08 },
    groundPerPitcherLevel: 0.035,
    flyPerPitcherMovement: 0.0016,
    groundPerBatterOppoLevel: 0.02,
    flyPerBatterPullLevel: 0.025,
    flyPerPowerPoint: 0.0022,
    minShare: 0.02,
  },
  // Stage 3 — pull / centre / opposite field.
  direction: {
    shares: { pull: 0.38, center: 0.34, oppo: 0.28 },
    pullPerPullLevel: 0.05,
    oppoPerOppoLevel: 0.05,
    centerPerSprayLevel: 0.03,
    minShare: 0.05,
  },
  // Stage 4 — does the ball fall in. These are hit rates on contact BEFORE the fielder's
  // ability is applied, so they sit above the finished BABIP.
  hitOnContact: {
    base: { ground: 0.242, line: 0.638, fly: 0.203, popup: 0.02 },
    /** Rating points of fielder defence needed to move the hit rate by one unit. */
    defenseScale: 240,
    /** Batter speed matters most on ground balls, least in the air. */
    speedScale: { ground: 700, line: 4000, fly: 4000, popup: 8000 },
    /** Balls hit to the gaps and down the lines are harder to field than centre cuts. */
    directionFactor: { pull: 1.04, center: 0.93, oppo: 1.03 },
    minRate: 0.01,
    maxRate: 0.92,
  },
  // Stage 4b — a fly ball that carries out. Only outfield fly balls and line drives are
  // eligible; the batter's power moves this far more than anything else.
  homeRunOnFly: {
    flyBase: 0.0535,
    lineDriveFactor: 0.28,
    powerCurveReference: 60,
    // A slightly steeper curve moves home runs from ordinary hitters toward genuine
    // sluggers without imposing a cap on record seasons or raising the league total.
    powerCurveScale: 24,
    minimumPowerLogMultiplier: -1.6,
    maximumPowerLogMultiplier: 1.0,
    velocityScale: 3400,
    movementScale: 3400,
    directionFactor: { pull: 1.4, center: 0.85, oppo: 0.62 },
    fatigueBonus: 0.18,
    // Made more common (see slugger_gold's rarity roll in players.ts) and correspondingly
    // smaller per player, so the 30-40 HR band fills in with several sluggers instead of a
    // single jackpot hitter towering over an otherwise flat power distribution.
    sluggerBaseMultiplier: 1.38,
    sluggerPowerBonusScale: 100,
    sluggerMaximumPowerBonus: 0.4,
    minRate: 0.0005,
    maxRate: 0.6,
  },
  // Stage 5 — how far the batter got on a hit.
  hitType: {
    tripleShare: { ground: 0.004, line: 0.022, fly: 0.03, popup: 0 },
    doubleShare: { ground: 0.03, line: 0.24, fly: 0.34, popup: 0.02 },
    /** Balls into the gaps stretch into extra bases far more often. */
    directionExtraBase: { pull: 1.08, center: 1.16, oppo: 1.0 },
    speedScale: 900,
    outfieldArmScale: 1100,
  },
  groundBall: {
    // Share of ground balls that become a double play *when one is possible* (runner
    // forced at first, fewer than two outs).
    doublePlayShare: 0.32,
  },
  baseRunning: {
    scoreFromFirstOnDouble: { standard: 0.43, fast: 0.58 },
    scoreFromSecondOnSingle: { standard: 0.45, fast: 0.58 },
    scoreFromThirdOnGroundOut: 0.55,
    scoreFromThirdOnFlyOut: 0.38,
    // A runner counts as "fast" from their own speed rating, not the batter's.
    fastRunnerSpeed: 72,
    // 走塁センス lifts a runner over the fast threshold without needing raw speed.
    baseRunningInstinctSpeedBonus: 6,
  },
  // Sacrifice bunts: only attempted in a textbook situation (no outs, a runner to move
  // over, nobody already on third). Rates are deliberately low so bunting stays a
  // situational tool rather than a league-wide offence driver.
  sacrificeBunt: {
    minimumBuntRating: 45,
    attemptRatingScale: 500,
    attemptPerSpecialLevel: 0.025,
    weakHitterAttemptBonus: 0.015,
    weakHitterPowerThreshold: 45,
    maximumAttemptRate: 0.12,
    baseSuccessRate: 0.58,
    successRatingScale: 125,
    successPerSpecialLevel: 0.045,
    minimumSuccessRate: 0.35,
    maximumSuccessRate: 0.94,
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
  // Specials that act on the game outside the plate-appearance rate formulas.
  specials: {
    /** 疲れにくい: each level stretches how far a stamina rating carries the pitcher. */
    toughPerLevel: 0.07,
    /** 配球の妙: each level adds to the catcher's effective game calling. */
    gameCallingPerLevel: 4,
    /** 勝負強さ: contact bonus with a runner in scoring position. */
    clutchHitPerLevel: 0.022,
    /** 対エース○: shields the batter from a strong starter's edge. */
    aceKillerPerLevel: 0.18,
    /** 初球○/×: swinging early trades walks for balls in play. */
    firstPitchWalkPerLevel: 0.05,
    firstPitchContactPerLevel: 0.012,
  },
} as const;
