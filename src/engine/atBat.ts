import { AT_BAT_BALANCE, FIELDING_BALANCE, PITCHER_USAGE_BALANCE } from '../data';
import {
  errorChance,
  fielderArmScore,
  fielderDefenseScore,
  fieldingSlotFor,
  isOutfieldSlot,
  resolveFielder,
  type BattedBallDirection,
  type FieldingSlot,
} from './fielding';
import { foreignPerformanceMultiplier } from './foreign';
import { clamp, random, randomInt } from './random';
import { hasGold, hasSpecial, specialLevel, specialMultiplier } from './specials';
import type {
  AtBatOutcome,
  AtBatSituation,
  BaseState,
  BattedBallType,
  ParkFactors,
  PlateAppearanceResult,
  Player,
} from './types';

// The subset of outcomes the at-bat simulation itself can produce (sacrifices are
// determined by the game loop, not by the pitcher/batter matchup roll).
type SimulatedPlateAppearanceResult = Exclude<PlateAppearanceResult, 'SH' | 'SF'>;

const PITCH_COUNT_RANGE: Record<SimulatedPlateAppearanceResult, [number, number]> = {
  K: [4, 7],
  BB: [5, 8],
  HBP: [1, 3],
  HR: [2, 5],
  '1B': [2, 5],
  '2B': [2, 5],
  '3B': [2, 4],
  GO: [1, 4],
  FO: [1, 4],
  DP: [3, 6],
  E: [1, 4],
};

const pitchCountFor = (result: SimulatedPlateAppearanceResult): number => {
  const [minimum, maximum] = PITCH_COUNT_RANGE[result];
  return randomInt(minimum, maximum);
};

const SLOT_LABEL: Record<string, string> = {
  投手: '投',
  捕手: '捕',
  一塁手: '一',
  二塁手: '二',
  三塁手: '三',
  遊撃手: '遊',
  左翼手: '左',
  中堅手: '中',
  右翼手: '右',
};

/** Build the Japanese play description fragment, e.g. 「遊ゴ」「左飛」「右中」. */
function describeContact(
  result: SimulatedPlateAppearanceResult,
  battedBall: BattedBallType,
  slot: FieldingSlot,
  direction: BattedBallDirection,
): string {
  const label = SLOT_LABEL[slot] ?? '中';
  if (result === 'HR') return label;
  if (result === '3B' || result === '2B') {
    // Extra-base hits are described by the gap they found.
    if (direction === 'center') return slot === '左翼手' ? '左中' : '右中';
    return label;
  }
  if (result === '1B') return label;
  if (battedBall === 'ground') return `${label}ゴ`;
  if (battedBall === 'line') return `${label}直`;
  if (battedBall === 'popup') return `${label}飛`;
  return `${label}飛`;
}

function finishNonContact(result: 'K' | 'BB' | 'HBP'): AtBatOutcome {
  return { result, pc: pitchCountFor(result), dir: null };
}

function finishContact(
  result: SimulatedPlateAppearanceResult,
  battedBall: BattedBallType,
  slot: FieldingSlot,
  direction: BattedBallDirection,
  errorFielderId: string | null,
): AtBatOutcome {
  return {
    result,
    pc: pitchCountFor(result),
    dir: describeContact(result, battedBall, slot, direction),
    battedBall,
    fieldingSlot: slot,
    errorFielderId,
  };
}

/** Draw from a set of weighted shares. */
function pickWeighted<T extends string>(shares: Record<T, number>): T {
  const keys = Object.keys(shares) as T[];
  const total = keys.reduce((sum, key) => sum + Math.max(0, shares[key]), 0);
  let roll = random() * total;
  for (const key of keys) {
    roll -= Math.max(0, shares[key]);
    if (roll <= 0) return key;
  }
  return keys[keys.length - 1] as T;
}

/** Stage 2 — ground ball, line drive, fly ball or pop-up. */
export function resolveBattedBallType(
  pitcher: Player,
  batter: Player,
  adjustedPower: number,
  adjustedMovement: number,
): BattedBallType {
  const config = AT_BAT_BALANCE.battedBall;
  // 重い球 / 低め○ / ゴロ打たせ○ all push the ball into the ground; a pitcher who works
  // up in the zone gives up more air.
  const groundPush =
    (specialLevel(pitcher, 'heavy') +
      specialLevel(pitcher, 'low') +
      specialLevel(pitcher, 'gb') * 1.4) *
    config.groundPerPitcherLevel;
  const movementLift = (adjustedMovement - 50) * config.flyPerPitcherMovement;
  const batterGround = specialLevel(batter, 'oppo') * config.groundPerBatterOppoLevel;
  const batterAir =
    specialLevel(batter, 'pull') * config.flyPerBatterPullLevel +
    (adjustedPower - 50) * config.flyPerPowerPoint;
  const shares = {
    ground: config.shares.ground + groundPush + batterGround - movementLift - batterAir * 0.6,
    line: config.shares.line + batterAir * 0.25,
    fly: config.shares.fly + movementLift + batterAir * 0.75 - groundPush * 0.7,
    popup: config.shares.popup + movementLift * 0.3 - groundPush * 0.3,
  };
  for (const key of Object.keys(shares) as BattedBallType[]) {
    shares[key] = Math.max(config.minShare, shares[key]);
  }
  return pickWeighted(shares);
}

/** Stage 3 — pull, centre or opposite field. */
export function resolveDirection(batter: Player): BattedBallDirection {
  const config = AT_BAT_BALANCE.direction;
  const shares = {
    pull: config.shares.pull + specialLevel(batter, 'pull') * config.pullPerPullLevel,
    center: config.shares.center + specialLevel(batter, 'spray') * config.centerPerSprayLevel,
    oppo: config.shares.oppo + specialLevel(batter, 'oppo') * config.oppoPerOppoLevel,
  };
  for (const key of Object.keys(shares) as BattedBallDirection[]) {
    shares[key] = Math.max(config.minShare, shares[key]);
  }
  return pickWeighted(shares);
}

/** Stage 4a — the chance an outfield fly or liner carries over the fence. */
function homeRunChanceOnContact(input: {
  battedBall: BattedBallType;
  direction: BattedBallDirection;
  adjustedPower: number;
  adjustedVelocity: number;
  adjustedMovement: number;
  staminaRatio: number;
  batter: Player;
  pitcher: Player;
  park: ParkFactors;
  batterContextMultiplier: number;
}): number {
  const config = AT_BAT_BALANCE.homeRunOnFly;
  const powerMultiplier = Math.exp(
    clamp(
      (softRatingDelta(input.adjustedPower) - softRatingDelta(config.powerCurveReference)) /
        config.powerCurveScale,
      config.minimumPowerLogMultiplier,
      config.maximumPowerLogMultiplier,
    ),
  );
  let chance = config.flyBase;
  if (input.battedBall === 'line') chance *= config.lineDriveFactor;
  chance *= powerMultiplier;
  chance *= config.directionFactor[input.direction];
  chance -= softRatingDelta(input.adjustedVelocity) / config.velocityScale;
  chance -= softRatingDelta(input.adjustedMovement) / config.movementScale;
  chance *= 1 + (1 - input.staminaRatio) * config.fatigueBonus;
  chance *= 1 - specialLevel(input.pitcher, 'heavy') * 0.05;
  if (hasGold(input.pitcher, 'heavy_gold')) chance *= 0.84;
  if (hasGold(input.batter, 'slugger_gold'))
    chance *=
      config.sluggerBaseMultiplier +
      clamp(
        (input.adjustedPower - config.powerCurveReference) / config.sluggerPowerBonusScale,
        0,
        config.sluggerMaximumPowerBonus,
      );
  chance *= input.batterContextMultiplier * input.park.homeRun;
  return clamp(chance, config.minRate, config.maxRate);
}

/** Stage 4c — the chance a fielded ball falls in for a hit. */
function hitChanceOnContact(input: {
  battedBall: BattedBallType;
  direction: BattedBallDirection;
  defenseScore: number;
  adjustedSpeed: number;
  adjustedFastballContact: number;
  batter: Player;
  park: ParkFactors;
  batterContextMultiplier: number;
  isPinch: boolean;
}): number {
  const config = AT_BAT_BALANCE.hitOnContact;
  let chance = config.base[input.battedBall];
  // Better defence turns more of the same batted balls into outs.
  chance -= (input.defenseScore - 50) / config.defenseScale;
  chance += (input.adjustedSpeed - 50) / config.speedScale[input.battedBall];
  chance += (input.adjustedFastballContact - 50) / AT_BAT_BALANCE.ballsInPlay.contactScale;
  chance *= config.directionFactor[input.direction];
  chance *= 1 + specialLevel(input.batter, 'avg') * 0.02;
  chance *= 1 + specialLevel(input.batter, 'spray') * 0.015;
  // 勝負強さ only shows up with a runner in scoring position.
  if (input.isPinch)
    chance *= 1 + specialLevel(input.batter, 'win') * AT_BAT_BALANCE.specials.clutchHitPerLevel;
  // 初球○ puts more balls in play; 初球× wastes the count's best pitch.
  chance *= 1 + specialLevel(input.batter, 'fbo') * AT_BAT_BALANCE.specials.firstPitchContactPerLevel;
  chance *= 1 - specialLevel(input.batter, 'fbx') * AT_BAT_BALANCE.specials.firstPitchContactPerLevel;
  if (hasGold(input.batter, 'avg_gold')) chance *= 1.12;
  if (hasGold(input.batter, 'spray_gold')) chance *= 1.08;
  chance *= input.batterContextMultiplier * input.park.hit;
  return clamp(chance, config.minRate, config.maxRate);
}

/** Stage 5 — single, double or triple. */
export function resolveHitType(
  battedBall: BattedBallType,
  direction: BattedBallDirection,
  adjustedSpeed: number,
  fielder: Player | null,
): '1B' | '2B' | '3B' {
  const config = AT_BAT_BALANCE.hitType;
  const gapFactor = config.directionExtraBase[direction];
  const speedBonus = (adjustedSpeed - 50) / config.speedScale;
  const armPenalty = (fielderArmScore(fielder) - 50) / config.outfieldArmScale;
  const tripleChance = Math.max(
    0,
    config.tripleShare[battedBall] * gapFactor + speedBonus * 0.5 - armPenalty,
  );
  const doubleChance = Math.max(
    0,
    config.doubleShare[battedBall] * gapFactor + speedBonus - armPenalty,
  );
  const roll = random();
  if (roll < tripleChance) return '3B';
  if (roll < tripleChance + doubleChance) return '2B';
  return '1B';
}

function softRatingDelta(value: number): number {
  const raw = value - 50,
    softness = PITCHER_USAGE_BALANCE.strikeoutTail.ratingDeltaSoftness;
  return raw / (1 + Math.abs(raw) / softness);
}

export function simAB(
  pitcher: Player,
  batter: Player,
  situation: AtBatSituation,
  catcherGameCalling: number,
  pitcherMastery: number,
  batterMastery: number,
  park: ParkFactors,
  priorMatchups: number,
): AtBatOutcome {
  const pitcherParams = pitcher.p,
    batterParams = batter.p,
    pitcherAdaptation = foreignPerformanceMultiplier(pitcher),
    batterAdaptation = foreignPerformanceMultiplier(batter),
    staminaRatio = clamp((situation.pStam || 80) / 100, 0.2, 1),
    pitcherHand = pitcher.hand.th ?? '右',
    batterHand = batter.hand.bat ?? '右',
    hasPlatoonAdvantage = batterHand === '両' || batterHand !== pitcherHand,
    platoonMultiplier = hasPlatoonAdvantage
      ? AT_BAT_BALANCE.platoon.batterAdvantageMultiplier
      : AT_BAT_BALANCE.platoon.pitcherAdvantageMultiplier,
    familiarityMultiplier = Math.min(
      AT_BAT_BALANCE.familiarity.maxMultiplier,
      1 + Math.max(0, priorMatchups) * AT_BAT_BALANCE.familiarity.perPriorMatchup,
    ),
    // 対エース○ gives the batter back part of what a high-quality pitcher takes away.
    pitcherQualityEdge = Math.max(
      0,
      ((pitcherParams.vel ?? 50) + (pitcherParams.nobi ?? 50) + (pitcherParams.ctrl ?? 50)) / 3 - 50,
    ),
    aceKillerMultiplier =
      1 +
      (specialLevel(batter, 'ace') * AT_BAT_BALANCE.specials.aceKillerPerLevel * pitcherQualityEdge) /
        50,
    batterContextMultiplier = platoonMultiplier * familiarityMultiplier * aceKillerMultiplier;
  const catcherLeadMultiplier = catcherGameCalling
    ? AT_BAT_BALANCE.catcherLead.baseMultiplier +
      (catcherGameCalling / 100) * AT_BAT_BALANCE.catcherLead.ratingShare
    : AT_BAT_BALANCE.catcherLead.fallbackMultiplier;
  const pitcherMasteryMultiplier =
      AT_BAT_BALANCE.mastery.baseMultiplier +
      (pitcherMastery || AT_BAT_BALANCE.mastery.defaultMastery) *
        AT_BAT_BALANCE.mastery.ratingShare,
    batterMasteryMultiplier =
      AT_BAT_BALANCE.mastery.baseMultiplier +
      (batterMastery || AT_BAT_BALANCE.mastery.defaultMastery) * AT_BAT_BALANCE.mastery.ratingShare;
  const bestBreakingPitch = (pitcherParams.pitches ?? [])
    .filter((pitch) => pitch.type !== '直球')
    .sort((a, b) => b.shr - a.shr)[0];
  const breakingBallContribution = bestBreakingPitch
    ? softRatingDelta(bestBreakingPitch.shr) / AT_BAT_BALANCE.strikeout.breakingBallScale
    : 0;
  const adjustedVelocity = (pitcherParams.vel ?? 50) * pitcherMasteryMultiplier * pitcherAdaptation,
    adjustedMovement = (pitcherParams.nobi ?? 50) * pitcherMasteryMultiplier * pitcherAdaptation,
    adjustedFastballContact = (batterParams.cf ?? 50) * batterMasteryMultiplier * batterAdaptation,
    adjustedBreakingContact = (batterParams.cb ?? 50) * batterMasteryMultiplier * batterAdaptation,
    adjustedContact = (adjustedFastballContact + adjustedBreakingContact) / 2;
  const strikeoutRatingEdge =
    softRatingDelta(adjustedVelocity) / AT_BAT_BALANCE.strikeout.velocityScale +
    softRatingDelta(adjustedMovement) / AT_BAT_BALANCE.strikeout.movementScale +
    breakingBallContribution -
    softRatingDelta(adjustedContact) / AT_BAT_BALANCE.strikeout.batterContactScale;
  let strikeoutRate =
    AT_BAT_BALANCE.strikeout.baseRate +
    Math.tanh(strikeoutRatingEdge / PITCHER_USAGE_BALANCE.strikeoutTail.ratingEffectSoftness) *
      PITCHER_USAGE_BALANCE.strikeoutTail.maximumRatingEffect;
  strikeoutRate *= catcherLeadMultiplier;
  strikeoutRate *= 1 - (1 - staminaRatio) * AT_BAT_BALANCE.strikeout.fatiguePenalty;
  strikeoutRate *= specialMultiplier(pitcher, 'nobi', 0.025);
  strikeoutRate *= specialMultiplier(pitcher, 'kire', 0.022);
  strikeoutRate *= specialMultiplier(pitcher, 'kk', 0.03);
  if (hasGold(pitcher, 'kk_gold')) strikeoutRate *= 1.22;
  if (hasGold(pitcher, 'kire_gold')) strikeoutRate *= 1.1;
  if (situation.isPinch) {
    // Pitcher specials: ピンチ◎ makes the pitcher better in a jam (more strikeouts),
    // ピンチ× worse. Batter specials run the opposite way: チャンス◎ means the batter
    // is harder to strike out.
    strikeoutRate *= 1 + specialLevel(pitcher, 'po') * 0.02;
    strikeoutRate *= 1 - specialLevel(pitcher, 'px') * 0.03;
    strikeoutRate *= 1 - specialLevel(batter, 'co') * 0.02;
    strikeoutRate *= 1 + specialLevel(batter, 'cx') * 0.03;
    if (hasGold(pitcher, 'po_gold')) strikeoutRate *= 1.12;
  }
  if (situation.isLead) {
    strikeoutRate *= 1 + specialLevel(pitcher, 'ldo') * 0.02;
    strikeoutRate *= 1 - specialLevel(pitcher, 'ldx') * 0.03;
  }
  strikeoutRate /= batterContextMultiplier;
  strikeoutRate = clamp(
    strikeoutRate,
    AT_BAT_BALANCE.strikeout.minRate,
    AT_BAT_BALANCE.strikeout.maxRate,
  );
  const adjustedControl = (pitcherParams.ctrl ?? 50) * pitcherMasteryMultiplier * pitcherAdaptation,
    adjustedDiscipline = (batterParams.dc ?? 50) * batterMasteryMultiplier * batterAdaptation;
  let walkRate =
    AT_BAT_BALANCE.walk.baseRate -
    softRatingDelta(adjustedControl) / AT_BAT_BALANCE.walk.controlScale +
    softRatingDelta(adjustedDiscipline) / AT_BAT_BALANCE.walk.disciplineScale;
  walkRate *= 1 + (1 - staminaRatio) * AT_BAT_BALANCE.walk.fatigueBonus;
  walkRate *= catcherLeadMultiplier;
  walkRate *= 1 - specialLevel(pitcher, 'cnr') * 0.03;
  walkRate *= 1 + specialLevel(batter, 'eye') * 0.04;
  walkRate *= 1 - specialLevel(batter, 'fbo') * AT_BAT_BALANCE.specials.firstPitchWalkPerLevel;
  walkRate *= 1 + specialLevel(batter, 'fbx') * AT_BAT_BALANCE.specials.firstPitchWalkPerLevel;
  if (hasGold(pitcher, 'cnr_gold')) walkRate *= 0.86;
  if (hasGold(batter, 'eye_gold')) walkRate *= 1.12;
  walkRate = clamp(walkRate, AT_BAT_BALANCE.walk.minRate, AT_BAT_BALANCE.walk.maxRate);
  const hitByPitchRate = clamp(
    AT_BAT_BALANCE.hitByPitch.baseRate +
      (1 - staminaRatio) * AT_BAT_BALANCE.hitByPitch.fatigueBonus,
    AT_BAT_BALANCE.hitByPitch.minRate,
    AT_BAT_BALANCE.hitByPitch.maxRate,
  );
  const adjustedPower = (batterParams.pw ?? 50) * batterMasteryMultiplier * batterAdaptation;
  const adjustedSpeed = (batterParams.sp ?? 50) * batterMasteryMultiplier * batterAdaptation;

  // ---- Stage 1: strikeout / walk / hit-by-pitch / ball in play ----
  const disciplineRoll = random();
  let cumulativeProbability = strikeoutRate;
  if (cumulativeProbability > disciplineRoll) return finishNonContact('K');
  if ((cumulativeProbability += walkRate) > disciplineRoll) return finishNonContact('BB');
  if ((cumulativeProbability += hitByPitchRate) > disciplineRoll) return finishNonContact('HBP');

  // ---- Stage 2: what kind of ball was hit ----
  const battedBall = resolveBattedBallType(pitcher, batter, adjustedPower, adjustedMovement);

  // ---- Stage 3: where it went ----
  const direction = resolveDirection(batter);
  const slot = fieldingSlotFor(battedBall, direction, batterHand);
  const fielder = resolveFielder(situation.fieldingLineup ?? [], slot);
  // The pitcher fields his own position, so his fielding rating is what matters there.
  const defenseScore =
    slot === '投手'
      ? (pitcher.p.fld ?? FIELDING_BALANCE.defaultDefenseScore)
      : fielderDefenseScore(fielder, slot);

  // ---- Stage 4a: does it leave the park ----
  if ((battedBall === 'fly' || battedBall === 'line') && isOutfieldSlot(slot)) {
    const homeRunChance = homeRunChanceOnContact({
      battedBall,
      direction,
      adjustedPower,
      adjustedVelocity,
      adjustedMovement,
      staminaRatio,
      batter,
      pitcher,
      park,
      batterContextMultiplier,
    });
    if (random() < homeRunChance) return finishContact('HR', battedBall, slot, direction, null);
  }

  // ---- Stage 4b: misplayed into an error ----
  if (random() < errorChance(battedBall, defenseScore, slot)) {
    return finishContact('E', battedBall, slot, direction, fielder?.id ?? null);
  }

  // ---- Stage 4c: hit or out ----
  const hitChance = hitChanceOnContact({
    battedBall,
    direction,
    defenseScore,
    adjustedSpeed,
    adjustedFastballContact,
    batter,
    park,
    batterContextMultiplier,
    isPinch: situation.isPinch,
  });
  if (random() >= hitChance) {
    // An out. A ground ball with a force at first and room for two outs can be doubled up.
    if (
      battedBall === 'ground' &&
      Boolean(situation.bases[0]) &&
      situation.outs < 2 &&
      random() < AT_BAT_BALANCE.groundBall.doublePlayShare
    ) {
      return finishContact('DP', battedBall, slot, direction, null);
    }
    return finishContact(battedBall === 'ground' ? 'GO' : 'FO', battedBall, slot, direction, null);
  }

  // ---- Stage 5: how far the batter got ----
  const hitType = resolveHitType(battedBall, direction, adjustedSpeed, fielder);
  return finishContact(hitType, battedBall, slot, direction, null);
}

const asPlayer = (runner: BaseState[number]): Player | null =>
  typeof runner === 'object' ? runner : null;

// Whether a runner takes the extra base is a property of that runner, not of whoever
// happens to be batting. 走塁センス stands in for instincts the raw speed rating misses.
const isFastRunner = (runner: BaseState[number]): boolean => {
  const player = asPlayer(runner);
  if (!player) return false;
  const instinctBonus = hasSpecial(player, 'run')
    ? AT_BAT_BALANCE.baseRunning.baseRunningInstinctSpeedBonus
    : 0;
  return (player.p.sp ?? 50) + instinctBonus > AT_BAT_BALANCE.baseRunning.fastRunnerSpeed;
};

export function advBases(
  bases: BaseState,
  result: PlateAppearanceResult,
  batter: Player,
  outs: number,
): { bases: BaseState; runs: number; scorers: Player[] } {
  const [runnerOnFirst, runnerOnSecond, runnerOnThird] = bases;
  switch (result) {
    case 'HR': {
      const scorers = [batter, runnerOnFirst, runnerOnSecond, runnerOnThird]
        .map(asPlayer)
        .filter((player): player is Player => player !== null);
      return { bases: [false, false, false], runs: scorers.length, scorers };
    }
    case '3B': {
      const scorers = [runnerOnFirst, runnerOnSecond, runnerOnThird]
        .map(asPlayer)
        .filter((player): player is Player => player !== null);
      return { bases: [false, false, batter], runs: scorers.length, scorers };
    }
    case '2B': {
      const scorers = [runnerOnThird, runnerOnSecond]
        .map(asPlayer)
        .filter((player): player is Player => player !== null);
      const next: BaseState = [false, batter, false];
      if (runnerOnFirst) {
        if (
          random() <
          (isFastRunner(runnerOnFirst)
            ? AT_BAT_BALANCE.baseRunning.scoreFromFirstOnDouble.fast
            : AT_BAT_BALANCE.baseRunning.scoreFromFirstOnDouble.standard)
        ) {
          const player = asPlayer(runnerOnFirst);
          if (player) scorers.push(player);
        } else next[2] = runnerOnFirst;
      }
      return { bases: next, runs: scorers.length, scorers };
    }
    // Reaching on an error advances runners like a single: the batter is safe at first
    // and everyone moves up, with the runner from third scoring.
    case 'E':
    case '1B': {
      const scorers = asPlayer(runnerOnThird) ? [asPlayer(runnerOnThird) as Player] : [];
      const next: BaseState = [batter, false, false];
      if (runnerOnSecond) {
        if (
          random() <
          (isFastRunner(runnerOnSecond)
            ? AT_BAT_BALANCE.baseRunning.scoreFromSecondOnSingle.fast
            : AT_BAT_BALANCE.baseRunning.scoreFromSecondOnSingle.standard)
        ) {
          const player = asPlayer(runnerOnSecond);
          if (player) scorers.push(player);
        } else next[2] = runnerOnSecond;
      }
      if (runnerOnFirst) next[1] = runnerOnFirst;
      return { bases: next, runs: scorers.length, scorers };
    }
    case 'BB':
    case 'HBP': {
      const loaded = runnerOnFirst && runnerOnSecond && runnerOnThird,
        forcedScorer = loaded ? asPlayer(runnerOnThird) : null,
        second = runnerOnFirst || runnerOnSecond,
        third = runnerOnFirst && runnerOnSecond ? runnerOnSecond : runnerOnThird;
      return {
        bases: [batter, second, third],
        runs: forcedScorer ? 1 : 0,
        scorers: forcedScorer ? [forcedScorer] : [],
      };
    }
    case 'GO': {
      const scores =
        Boolean(runnerOnThird) &&
        outs < 2 &&
        random() < AT_BAT_BALANCE.baseRunning.scoreFromThirdOnGroundOut;
      const scorer = scores ? asPlayer(runnerOnThird) : null;
      return {
        bases: [runnerOnFirst, runnerOnSecond, scores ? false : runnerOnThird],
        runs: scorer ? 1 : 0,
        scorers: scorer ? [scorer] : [],
      };
    }
    case 'FO': {
      const scores =
        Boolean(runnerOnThird) &&
        outs < 2 &&
        random() < AT_BAT_BALANCE.baseRunning.scoreFromThirdOnFlyOut;
      const scorer = scores ? asPlayer(runnerOnThird) : null;
      return {
        bases: [runnerOnFirst, runnerOnSecond, scores ? false : runnerOnThird],
        runs: scorer ? 1 : 0,
        scorers: scorer ? [scorer] : [],
      };
    }
    case 'SF': {
      // Scored as a sacrifice fly only because a run came home; the runner tags from third.
      const scorer = outs < 2 ? asPlayer(runnerOnThird) : null;
      return {
        bases: [runnerOnFirst, runnerOnSecond, scorer ? false : runnerOnThird],
        runs: scorer ? 1 : 0,
        scorers: scorer ? [scorer] : [],
      };
    }
    case 'SH':
      // The batter is retired at first; each existing runner moves up one base.
      return {
        bases: [false, runnerOnFirst, runnerOnSecond || runnerOnThird],
        runs: 0,
        scorers: [],
      };
    case 'DP':
      return { bases: [false, runnerOnSecond, runnerOnThird], runs: 0, scorers: [] };
    default:
      return { bases: [...bases], runs: 0, scorers: [] };
  }
}

export function buildDesc(
  batterName: string,
  result: PlateAppearanceResult,
  direction: string | null,
  rbi: number,
): string {
  if (result === 'K') return `${batterName}、三振`;
  if (result === 'BB') return `${batterName}、四球`;
  if (result === 'HBP') return `${batterName}、死球`;
  if (result === 'HR') return `${batterName}、${direction}本塁打${rbi > 1 ? `（${rbi}ラン）` : ''}`;
  if (result === '3B') return `${batterName}、${direction}三塁打${rbi > 0 ? `で${rbi}点` : ''}`;
  if (result === '2B') return `${batterName}、${direction}二塁打${rbi > 0 ? `で${rbi}点` : ''}`;
  if (result === '1B') return `${batterName}、${direction}安打${rbi > 0 ? `で${rbi}点` : ''}`;
  if (result === 'SH') return `${batterName}、${direction}`;
  if (result === 'SF') return `${batterName}、${direction}で${rbi}点`;
  if (result === 'GO' || result === 'FO')
    return `${batterName}、${direction}${rbi > 0 ? `で${rbi}点` : ''}`;
  if (result === 'DP') return `${batterName}、${direction}併殺打`;
  return batterName;
}
