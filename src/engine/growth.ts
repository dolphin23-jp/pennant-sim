import {
  BS,
  GROW_P,
  MATURITY_PEAK_AGE,
  PLAYER_DEVELOPMENT_BALANCE,
  POSITION_CONVERSION_BALANCE,
  PS,
} from '../data';
import { calcOVR } from './ratings';
import { clamp, random, randomChoice, randomInt } from './random';
import { ensureSpecialLevels, syncSpecialsFromLevels } from './specials';
import type {
  AwakeningEvent,
  AwakeningResult,
  FieldPosition,
  Maturity,
  Player,
  PlayerParams,
  Teams,
} from './types';

export function developmentAgeCoefficient(age: number, maturity: Maturity): number {
  const balance = PLAYER_DEVELOPMENT_BALANCE.careerCurve,
    yearsToPeak = MATURITY_PEAK_AGE[maturity] - age;
  if (yearsToPeak >= balance.yearsToPeak.farDevelopment)
    return balance.growthCoefficient.farDevelopment;
  if (yearsToPeak >= balance.yearsToPeak.development) return balance.growthCoefficient.development;
  if (yearsToPeak >= balance.yearsToPeak.rapidDevelopment)
    return balance.growthCoefficient.rapidDevelopment;
  if (yearsToPeak >= balance.yearsToPeak.peakApproach)
    return balance.growthCoefficient.peakApproach;

  const yearsPastPeak = -yearsToPeak;
  if (yearsPastPeak <= balance.yearsPastPeak.plateau) return balance.growthCoefficient.peakWindow;
  const maturityDecline =
    yearsPastPeak <= balance.yearsPastPeak.earlyDecline
      ? balance.declineCoefficient.earlyDecline
      : yearsPastPeak <= balance.yearsPastPeak.decline
        ? balance.declineCoefficient.decline
        : yearsPastPeak <= balance.yearsPastPeak.lateDecline
          ? balance.declineCoefficient.lateDecline
          : balance.declineCoefficient.finalDecline;
  return maturityDecline * agingDeclineMultiplier(age);
}

export function agingDeclineMultiplier(age: number): number {
  const balance = PLAYER_DEVELOPMENT_BALANCE.careerCurve.chronologicalDecline,
    years = Math.max(0, age - balance.startAge);
  return clamp(
    1 + years * balance.linearPerYear + years ** 2 * balance.quadraticPerYear,
    1,
    balance.maximumMultiplier,
  );
}
export function growthParameters(player: Player): Array<keyof PlayerParams> {
  return player.isP
    ? ['vel', 'ctrl', 'stam', 'nobi', 'fld']
    : [
        'cf',
        'cb',
        'pw',
        'dc',
        'sp',
        'df',
        'arm',
        'stam',
        ...(player.pos === '捕手' ? (['ld'] as Array<keyof PlayerParams>) : []),
      ];
}
export function growPlayer(player: Player): Player {
  const params = { ...player.p },
    potential = { ...player.pot },
    parameterNames = growthParameters(player),
    ageEffect = developmentAgeCoefficient(player.age, player.mat),
    currentOverall = calcOVR(player, player.pos),
    overallDeclineMultiplier =
      ageEffect < 0
        ? currentOverall >= 82
          ? 1.7
          : currentOverall >= 72
            ? 1.3
            : currentOverall >= 62
              ? 1
              : 0.72
        : 1;
  const trainingBonusByPolicy: Partial<
    Record<string, Partial<Record<keyof PlayerParams, number>>>
  > = {
    power: { pw: 0.3 },
    contact: { cf: 0.3, cb: 0.3 },
    speed: { sp: 0.3 },
    defense: { df: 0.3, arm: 0.3 },
    velocity: { vel: 0.3 },
    control: { ctrl: 0.3 },
    stamina_t: { stam: 0.3 },
  };
  const changes: Array<{ param: keyof PlayerParams; before: number; after: number; diff: number }> =
    [];
  for (const parameter of parameterNames) {
    const before = Number(params[parameter] ?? 50),
      definition = GROW_P[parameter];
    if (!definition) continue;
    const ceiling = Number(potential[parameter] ?? before + 5),
      gap = ceiling - before;
    let adjustedAgeEffect = ageEffect;
    if (ageEffect < 0) {
      adjustedAgeEffect = ageEffect * overallDeclineMultiplier;
      if (parameter === 'vel' || parameter === 'sp') adjustedAgeEffect *= 1.35;
      else if (parameter === 'ctrl' || parameter === 'dc' || parameter === 'ld')
        adjustedAgeEffect *= 0.62;
    }
    const trainingBonus = trainingBonusByPolicy[player.trainPolicy]?.[parameter] ?? 0,
      annualVariation = 0.55 + random() * 0.9,
      developmentGrowth =
        adjustedAgeEffect >= 0
          ? gap *
            definition.c *
            adjustedAgeEffect *
            annualVariation *
            (1 + trainingBonus) *
            (player.potentialClass === 'elite'
              ? player.generationalTalent
                ? PLAYER_DEVELOPMENT_BALANCE.careerCurve.generationalGrowthMultiplier
                : PLAYER_DEVELOPMENT_BALANCE.careerCurve.eliteGrowthMultiplier
              : 1)
          : before *
            definition.c *
            adjustedAgeEffect *
            PLAYER_DEVELOPMENT_BALANCE.careerCurve.currentRatingDeclineScale *
            annualVariation,
      randomVariation =
        (random() * 2 - 1) * PLAYER_DEVELOPMENT_BALANCE.annualRandomVariation.maxAbsoluteChange,
      developedValue =
        developmentGrowth > 0
          ? Math.min(before + developmentGrowth, ceiling)
          : before + developmentGrowth,
      nextValue = Math.round(developedValue + randomVariation);
    (params as unknown as Record<string, unknown>)[parameter] = clamp(
      nextValue,
      PLAYER_DEVELOPMENT_BALANCE.annualRandomVariation.minimumRating,
      PLAYER_DEVELOPMENT_BALANCE.annualRandomVariation.maximumRating,
    );
    const after = Number(params[parameter] ?? 50),
      difference = after - before;
    if (difference !== 0) changes.push({ param: parameter, before, after, diff: difference });
  }
  if (!changes.length) {
    const fallbackParameter = randomChoice(
      parameterNames.filter((parameter) => Boolean(GROW_P[parameter])),
    );
    const before = Number(params[fallbackParameter] ?? 50),
      preferredDirection = ageEffect > 0 ? 1 : ageEffect < 0 ? -1 : random() < 0.5 ? -1 : 1,
      step = PLAYER_DEVELOPMENT_BALANCE.annualRandomVariation.fallbackStep,
      minimum = PLAYER_DEVELOPMENT_BALANCE.annualRandomVariation.minimumRating,
      maximum = PLAYER_DEVELOPMENT_BALANCE.annualRandomVariation.maximumRating;
    let after = clamp(before + preferredDirection * step, minimum, maximum);
    if (after === before) after = clamp(before - preferredDirection * step, minimum, maximum);
    (params as unknown as Record<string, unknown>)[fallbackParameter] = after;
    changes.push({ param: fallbackParameter, before, after, diff: after - before });
  }
  const overallBefore = calcOVR(player, player.pos),
    updatedPlayer: Player = { ...player, p: params, age: player.age + 1 },
    overallAfter = calcOVR(updatedPlayer, updatedPlayer.pos);
  updatedPlayer.growthLog = [
    ...(player.growthLog ?? []).slice(-9),
    {
      year: updatedPlayer.age - 1,
      ovrBefore: overallBefore,
      ovrAfter: overallAfter,
      delta: overallAfter - overallBefore,
      changes,
    },
  ];
  return updatedPlayer;
}

/** Point a batter at an unfamiliar position, starting from a low, deliberately shaky
 * aptitude. Does nothing to their listed primary position (`pos`) or existing aptitudes -
 * this only opens a new one and marks it for gradual yearly practice. */
export function startPositionConversion(player: Player, pos: FieldPosition): Player {
  const balance = POSITION_CONVERSION_BALANCE.startingAptitude,
    positions = player.positions ?? [],
    existing = positions.find((entry) => entry.pos === pos),
    startingAptitude = existing
      ? existing.apt
      : randomInt(balance.minimum, balance.maximum),
    nextPositions = existing
      ? positions
      : [...positions, { pos, apt: startingAptitude }];
  return { ...player, positions: nextPositions, conversionTarget: { pos, startedAge: player.age } };
}

export function cancelPositionConversion(player: Player): Player {
  if (!player.conversionTarget) return player;
  return { ...player, conversionTarget: undefined };
}

function conversionAgeFactor(age: number): number {
  const { ageFactor, ageThresholds } = POSITION_CONVERSION_BALANCE;
  if (age <= ageThresholds.young) return ageFactor.young;
  if (age <= ageThresholds.prime) return ageFactor.prime;
  if (age <= ageThresholds.veteran) return ageFactor.veteran;
  return ageFactor.late;
}

/** One offseason's worth of conversion practice. Aptitude climbs toward the practice
 * ceiling and the target clears itself once reached, so a converted player settles into
 * an ordinary secondary position going forward. */
export function advancePositionConversion(player: Player): Player {
  const target = player.conversionTarget;
  if (!target) return player;
  const balance = POSITION_CONVERSION_BALANCE,
    positions = player.positions ?? [],
    current = positions.find((entry) => entry.pos === target.pos)?.apt ?? 0;
  if (current >= balance.ceiling) return { ...player, conversionTarget: undefined };
  const gain = randomInt(balance.annualGain.minimum, balance.annualGain.maximum) *
      conversionAgeFactor(player.age),
    nextAptitude = Math.round(clamp(current + gain, 0, balance.ceiling)),
    nextPositions = positions.some((entry) => entry.pos === target.pos)
      ? positions.map((entry) => (entry.pos === target.pos ? { ...entry, apt: nextAptitude } : entry))
      : [...positions, { pos: target.pos, apt: nextAptitude }];
  return {
    ...player,
    positions: nextPositions,
    conversionTarget: nextAptitude >= balance.ceiling ? undefined : target,
  };
}

function awakeningPotentialGap(player: Player): number {
  const parameterNames = growthParameters(player);
  return Math.max(
    0,
    ...parameterNames.map(
      (parameter) =>
        Number(player.pot?.[parameter] ?? player.p?.[parameter] ?? 50) -
        Number(player.p?.[parameter] ?? 50),
    ),
  );
}
export function checkAwakening(player: Player, inSeason: boolean): AwakeningResult | null {
  if ((player.awakeCount || 0) >= 3 && random() > 0.04) return null;
  if (player.seasonAwakenDone && inSeason) return null;
  const overall = calcOVR(player, player.pos),
    potentialGap = awakeningPotentialGap(player),
    ageFactor =
      player.age <= 21
        ? 3
        : player.age <= 23
          ? 2
          : player.age <= 25
            ? 0.9
            : player.age <= 27
              ? 0.3
              : 0.08,
    lowOverallFactor =
      overall <= 44 ? 3 : overall <= 50 ? 2 : overall <= 56 ? 0.85 : overall <= 62 ? 0.25 : 0.05,
    latentFactor =
      potentialGap >= 20 ? 1.4 : potentialGap >= 14 ? 0.9 : potentialGap >= 10 ? 0.52 : 0.18,
    probability =
      (inSeason
        ? PLAYER_DEVELOPMENT_BALANCE.awakening.inSeasonBaseRate
        : PLAYER_DEVELOPMENT_BALANCE.awakening.offseasonBaseRate) *
      ageFactor *
      lowOverallFactor *
      latentFactor *
      (player.isP && player.role !== '先発' ? 1.1 : 1);
  if (random() > probability) return null;
  const params = { ...player.p },
    potential = { ...player.pot },
    parameterNames = growthParameters(player),
    chosenParameters = parameterNames.sort(() => random() - 0.5).slice(0, random() < 0.25 ? 2 : 1),
    isBreakthrough = random() < 0.22,
    events: AwakeningEvent[] = [];
  for (const parameter of chosenParameters) {
    const boost = inSeason ? randomInt(7, 14) : randomInt(9, 18),
      currentValue = Number(params[parameter] ?? 50);
    (params as unknown as Record<string, unknown>)[parameter] = currentValue + boost;
    const boostedValue = Number(params[parameter]);
    if (isBreakthrough)
      potential[parameter] = Number(potential[parameter] ?? boostedValue + 5) + randomInt(6, 12);
    else potential[parameter] = Math.max(Number(potential[parameter] ?? 0), boostedValue + 3);
    events.push({ param: parameter, boost, isBreakthrough });
  }
  let newSpecial = null;
  const nextSpecialLevels = ensureSpecialLevels(player);
  if (isBreakthrough && random() < 0.42) {
    const pool = player.isP ? PS : BS,
      available = pool.filter((special) => (nextSpecialLevels[special.id] || 0) < special.tierMax);
    if (available.length) {
      newSpecial = randomChoice(available);
      nextSpecialLevels[newSpecial.id] = clamp(
        (nextSpecialLevels[newSpecial.id] || 0) + 1,
        0,
        newSpecial.tierMax,
      );
    }
  }
  return {
    player: syncSpecialsFromLevels({
      ...player,
      p: params,
      pot: potential,
      awakeCount: (player.awakeCount || 0) + 1,
      seasonAwakenDone: inSeason ? true : player.seasonAwakenDone,
      specialLevels: nextSpecialLevels,
      growthLog: [
        ...(player.growthLog || []),
        {
          year: player.age,
          type: 'awakening',
          isBreakthrough,
          events: events.map((event) => ({ param: event.param, boost: event.boost })),
          newSpecial: newSpecial?.n || null,
        },
      ],
    }),
    events,
    isBreakthrough,
    newSpecial,
  };
}
export function growthPhase(teams: Teams): {
  teams: Teams;
  awakeEvents: Array<AwakeningResult & { tk: string; name: string }>;
} {
  const nextTeams = { ...teams },
    awakeEvents: Array<AwakeningResult & { tk: string; name: string }> = [];
  for (const teamKey of Object.keys(nextTeams) as Array<keyof Teams>) {
    const team = { ...nextTeams[teamKey] };
    team.pitchers = team.pitchers.map((pitcher) => {
      const grown = growPlayer(pitcher);
      grown.seasonAwakenDone = false;
      const awakening = checkAwakening(grown, false);
      if (awakening) {
        awakeEvents.push({ ...awakening, tk: teamKey, name: awakening.player.name });
        return awakening.player;
      }
      return grown;
    });
    team.fielders = team.fielders.map((fielder) => {
      const grown = advancePositionConversion(growPlayer(fielder));
      grown.seasonAwakenDone = false;
      const awakening = checkAwakening(grown, false);
      if (awakening) {
        awakeEvents.push({ ...awakening, tk: teamKey, name: awakening.player.name });
        return awakening.player;
      }
      return grown;
    });
    nextTeams[teamKey] = team;
  }
  return { teams: nextTeams, awakeEvents };
}
export function applyInSeasonAwakening(
  team: Teams[keyof Teams],
  eligiblePlayerIds?: ReadonlySet<string>,
): {
  team: Teams[keyof Teams];
  events: Array<AwakeningResult & { name: string; isP: boolean }>;
} {
  const events: Array<AwakeningResult & { name: string; isP: boolean }> = [],
    nextTeam = {
      ...team,
      pitchers: team.pitchers.map((pitcher) => {
        if (
          (eligiblePlayerIds && !eligiblePlayerIds.has(pitcher.id)) ||
          (pitcher.injuryDays ?? 0) > 0
        )
          return pitcher;
        const awakening = checkAwakening(pitcher, true);
        if (awakening) {
          events.push({ ...awakening, name: awakening.player.name, isP: true });
          return awakening.player;
        }
        return pitcher;
      }),
      fielders: team.fielders.map((fielder) => {
        if (
          (eligiblePlayerIds && !eligiblePlayerIds.has(fielder.id)) ||
          (fielder.injuryDays ?? 0) > 0
        )
          return fielder;
        const awakening = checkAwakening(fielder, true);
        if (awakening) {
          events.push({ ...awakening, name: awakening.player.name, isP: false });
          return awakening.player;
        }
        return fielder;
      }),
    };
  return { team: nextTeam, events };
}
