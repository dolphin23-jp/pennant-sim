import { AT_BAT_BALANCE, PITCHER_USAGE_BALANCE } from '../data';
import { foreignPerformanceMultiplier } from './foreign';
import { clamp, random, randomChoice, randomInt } from './random';
import { hasGold, specialLevel, specialMultiplier } from './specials';
import type {
  AtBatOutcome,
  AtBatSituation,
  BaseState,
  ParkFactors,
  PlateAppearanceResult,
  Player,
} from './types';

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
    batterContextMultiplier = platoonMultiplier * familiarityMultiplier;
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
    strikeoutRate *= 1 - specialLevel(pitcher, 'po') * 0.02;
    strikeoutRate *= 1 + specialLevel(pitcher, 'px') * 0.03;
    strikeoutRate *= 1 - specialLevel(batter, 'co') * 0.02;
    strikeoutRate *= 1 + specialLevel(batter, 'cx') * 0.03;
    if (hasGold(pitcher, 'po_gold')) strikeoutRate *= 0.88;
  }
  if (situation.isLead) {
    strikeoutRate *= 1 - specialLevel(pitcher, 'ldo') * 0.02;
    strikeoutRate *= 1 + specialLevel(pitcher, 'ldx') * 0.03;
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
  const referencePowerDelta = softRatingDelta(AT_BAT_BALANCE.homeRun.powerCurveReference);
  const homeRunPowerMultiplier = Math.exp(
    clamp(
      (softRatingDelta(adjustedPower) - referencePowerDelta) /
        AT_BAT_BALANCE.homeRun.powerCurveScale,
      AT_BAT_BALANCE.homeRun.minimumPowerLogMultiplier,
      AT_BAT_BALANCE.homeRun.maximumPowerLogMultiplier,
    ),
  );
  let homeRunRate =
    AT_BAT_BALANCE.homeRun.baseRate -
    softRatingDelta(adjustedVelocity) / AT_BAT_BALANCE.homeRun.velocityScale -
    softRatingDelta(adjustedMovement) / AT_BAT_BALANCE.homeRun.movementScale;
  homeRunRate *= homeRunPowerMultiplier;
  homeRunRate *= catcherLeadMultiplier;
  homeRunRate *= 1 + (1 - staminaRatio) * AT_BAT_BALANCE.homeRun.fatigueBonus;
  homeRunRate *= 1 - specialLevel(pitcher, 'heavy') * 0.05;
  homeRunRate *= 1 - specialLevel(pitcher, 'gb') * 0.06;
  homeRunRate *= 1 + specialLevel(batter, 'pull') * 0.035;
  if (hasGold(pitcher, 'heavy_gold')) homeRunRate *= 0.84;
  if (hasGold(batter, 'slugger_gold'))
    homeRunRate *=
      AT_BAT_BALANCE.homeRun.sluggerBaseMultiplier +
      clamp(
        (adjustedPower - AT_BAT_BALANCE.homeRun.powerCurveReference) /
          AT_BAT_BALANCE.homeRun.sluggerPowerBonusScale,
        0,
        AT_BAT_BALANCE.homeRun.sluggerMaximumPowerBonus,
      );
  homeRunRate *=
    batterContextMultiplier * park.homeRun * AT_BAT_BALANCE.homeRun.environmentMultiplier;
  homeRunRate = clamp(homeRunRate, AT_BAT_BALANCE.homeRun.minRate, AT_BAT_BALANCE.homeRun.maxRate);
  let groundBallRate = AT_BAT_BALANCE.groundBall.baseRate;
  groundBallRate *= 1 + specialLevel(pitcher, 'heavy') * 0.03;
  groundBallRate *= 1 + specialLevel(pitcher, 'low') * 0.025;
  groundBallRate *= 1 - specialLevel(batter, 'pull') * 0.018;
  groundBallRate *= 1 + specialLevel(batter, 'oppo') * 0.015;
  if (hasGold(pitcher, 'heavy_gold')) groundBallRate *= 1.08;
  const adjustedSpeed = (batterParams.sp ?? 50) * batterMasteryMultiplier * batterAdaptation;
  let ballsInPlayAverage =
    AT_BAT_BALANCE.ballsInPlay.baseAverage +
    (adjustedSpeed - 50) / AT_BAT_BALANCE.ballsInPlay.speedScale +
    (adjustedFastballContact - 50) / AT_BAT_BALANCE.ballsInPlay.contactScale;
  ballsInPlayAverage *= 1 + specialLevel(batter, 'avg') * 0.02;
  ballsInPlayAverage *= 1 + specialLevel(batter, 'spray') * 0.015;
  if (hasGold(batter, 'avg_gold')) ballsInPlayAverage *= 1.12;
  if (hasGold(batter, 'spray_gold')) ballsInPlayAverage *= 1.08;
  if (hasGold(batter, 'sb_gold')) ballsInPlayAverage *= 1.04;
  ballsInPlayAverage *= batterContextMultiplier * park.hit;
  ballsInPlayAverage = clamp(
    ballsInPlayAverage,
    AT_BAT_BALANCE.ballsInPlay.minAverage,
    AT_BAT_BALANCE.ballsInPlay.maxAverage,
  );
  const resultRoll = random();
  let cumulativeProbability = 0,
    result: PlateAppearanceResult;
  if ((cumulativeProbability += strikeoutRate) > resultRoll) result = 'K';
  else if ((cumulativeProbability += walkRate) > resultRoll) result = 'BB';
  else if ((cumulativeProbability += hitByPitchRate) > resultRoll) result = 'HBP';
  else if ((cumulativeProbability += homeRunRate) > resultRoll) result = 'HR';
  else {
    const isGroundBall = random() < groundBallRate,
      ballInPlayRoll = random();
    if (isGroundBall) {
      if (ballInPlayRoll < ballsInPlayAverage * AT_BAT_BALANCE.groundBall.singleShare)
        result = '1B';
      else if (
        ballInPlayRoll <
        ballsInPlayAverage *
          (AT_BAT_BALANCE.groundBall.singleShare + AT_BAT_BALANCE.groundBall.doublePlayShare)
      )
        result = 'DP';
      else result = 'GO';
    } else {
      if (ballInPlayRoll < ballsInPlayAverage * AT_BAT_BALANCE.airBall.tripleShare) result = '3B';
      else if (
        ballInPlayRoll <
        ballsInPlayAverage *
          (AT_BAT_BALANCE.airBall.tripleShare + AT_BAT_BALANCE.airBall.doubleShare)
      )
        result = '2B';
      else if (ballInPlayRoll < ballsInPlayAverage) result = '1B';
      else result = 'FO';
    }
  }
  const pitchCounts: Record<PlateAppearanceResult, number> = {
    K: randomInt(4, 7),
    BB: randomInt(5, 8),
    HBP: randomInt(1, 3),
    HR: randomInt(2, 5),
    '1B': randomInt(2, 5),
    '2B': randomInt(2, 5),
    '3B': randomInt(2, 4),
    GO: randomInt(1, 4),
    FO: randomInt(1, 4),
    DP: randomInt(3, 6),
  };
  const directions: Record<PlateAppearanceResult, string | null> = {
    HR: randomChoice(['左', '中', '右']),
    '3B': randomChoice(['左中', '右中']),
    '2B': randomChoice(['左', '右中', '左中']),
    '1B': randomChoice(['左', '中', '右']),
    GO: randomChoice(['一ゴ', '二ゴ', '三ゴ', '遊ゴ', '投ゴ']),
    FO: randomChoice(['左飛', '中飛', '右飛', '内飛']),
    DP: randomChoice(['二ゴ', '遊ゴ', '三ゴ']),
    K: null,
    BB: null,
    HBP: null,
  };
  return { result, pc: pitchCounts[result] || 3, dir: directions[result] || null };
}

export function advBases(
  bases: BaseState,
  result: PlateAppearanceResult,
  batter: Player,
  outs: number,
): { bases: BaseState; runs: number } {
  const [runnerOnFirst, runnerOnSecond, runnerOnThird] = bases,
    isFast = (batter.p.sp ?? 50) > 72;
  switch (result) {
    case 'HR':
      return {
        bases: [false, false, false],
        runs: 1 + (runnerOnFirst ? 1 : 0) + (runnerOnSecond ? 1 : 0) + (runnerOnThird ? 1 : 0),
      };
    case '3B':
      return {
        bases: [false, false, batter],
        runs: (runnerOnFirst ? 1 : 0) + (runnerOnSecond ? 1 : 0) + (runnerOnThird ? 1 : 0),
      };
    case '2B': {
      let runs = (runnerOnThird ? 1 : 0) + (runnerOnSecond ? 1 : 0);
      const next: BaseState = [false, batter, false];
      if (runnerOnFirst) {
        if (
          random() <
          (isFast
            ? AT_BAT_BALANCE.baseRunning.scoreFromFirstOnDouble.fast
            : AT_BAT_BALANCE.baseRunning.scoreFromFirstOnDouble.standard)
        )
          runs += 1;
        else next[2] = runnerOnFirst;
      }
      return { bases: next, runs };
    }
    case '1B': {
      let runs = runnerOnThird ? 1 : 0;
      const next: BaseState = [batter, false, false];
      if (runnerOnSecond) {
        if (
          random() <
          (isFast
            ? AT_BAT_BALANCE.baseRunning.scoreFromSecondOnSingle.fast
            : AT_BAT_BALANCE.baseRunning.scoreFromSecondOnSingle.standard)
        )
          runs += 1;
        else next[2] = runnerOnSecond;
      }
      if (runnerOnFirst) next[1] = runnerOnFirst;
      return { bases: next, runs };
    }
    case 'BB':
    case 'HBP': {
      const runs = runnerOnFirst && runnerOnSecond && runnerOnThird ? 1 : 0,
        second = runnerOnFirst || runnerOnSecond,
        third = runnerOnFirst && runnerOnSecond ? runnerOnSecond : runnerOnThird;
      return { bases: [batter, second, third], runs };
    }
    case 'GO': {
      const scores =
        Boolean(runnerOnThird) &&
        outs < 2 &&
        random() < AT_BAT_BALANCE.baseRunning.scoreFromThirdOnGroundOut;
      return {
        bases: [runnerOnFirst, runnerOnSecond, scores ? false : runnerOnThird],
        runs: scores ? 1 : 0,
      };
    }
    case 'FO': {
      const scores =
        Boolean(runnerOnThird) &&
        outs < 2 &&
        random() < AT_BAT_BALANCE.baseRunning.scoreFromThirdOnFlyOut;
      return {
        bases: [runnerOnFirst, runnerOnSecond, scores ? false : runnerOnThird],
        runs: scores ? 1 : 0,
      };
    }
    case 'DP':
      return { bases: [false, runnerOnSecond, runnerOnThird], runs: 0 };
    default:
      return { bases: [...bases], runs: 0 };
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
  if (result === 'GO' || result === 'FO')
    return `${batterName}、${direction}${rbi > 0 ? `で${rbi}点` : ''}`;
  if (result === 'DP') return `${batterName}、${direction}併殺打`;
  return batterName;
}
