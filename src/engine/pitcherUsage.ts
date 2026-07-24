import { PITCHER_USAGE_BALANCE } from '../data';
import { clamp } from './random';
import { calcOVR } from './ratings';
import type { AtBatLogEntry, Player, Team } from './types';

const MILLISECONDS_PER_DAY = 86_400_000;

function calendarDaysBetween(first: string, second: string): number {
  const firstTime = Date.parse(`${first}T00:00:00Z`);
  const secondTime = Date.parse(`${second}T00:00:00Z`);
  if (!Number.isFinite(firstTime) || !Number.isFinite(secondTime)) return 0;
  return Math.max(0, Math.round((secondTime - firstTime) / MILLISECONDS_PER_DAY));
}

export function recoverPitcherForGame(player: Player, gameDate: string): Player {
  if (!player.isP) return player;
  const previousUpdate = player.fatigueUpdatedOn;
  if (!previousUpdate)
    return {
      ...player,
      fatigueUpdatedOn: gameDate,
      consecutivePitchingGames:
        player.lastPitchedOn && calendarDaysBetween(player.lastPitchedOn, gameDate) <= 1
          ? (player.consecutivePitchingGames ?? 0)
          : 0,
    };
  const elapsedDays = calendarDaysBetween(previousUpdate, gameDate),
    fatigue = clamp(
      (player.fatigue ?? 0) - elapsedDays * PITCHER_USAGE_BALANCE.fatigue.recoveryPerCalendarDay,
      0,
      100,
    ),
    appearanceGap = player.lastPitchedOn
      ? calendarDaysBetween(player.lastPitchedOn, gameDate)
      : Number.POSITIVE_INFINITY;
  return {
    ...player,
    fatigue,
    fatigueUpdatedOn: gameDate,
    consecutivePitchingGames: appearanceGap <= 1 ? (player.consecutivePitchingGames ?? 0) : 0,
  };
}

export function prepareTeamPitchersForGame(team: Team, gameDate?: string): Team {
  if (!gameDate) return team;
  return {
    ...team,
    pitchers: team.pitchers.map((pitcher) => recoverPitcherForGame(pitcher, gameDate)),
  };
}

function workloadFor(
  player: Player,
  pitchCount: number,
  consecutiveGames: number,
  startedGame: boolean,
): number {
  const balance = PITCHER_USAGE_BALANCE.fatigue,
    base = startedGame
      ? balance.starterBaseLoad
      : player.role === 'クローザー'
        ? balance.closerBaseLoad
        : balance.relieverBaseLoad,
    pitchLoad = startedGame
      ? balance.starterPitchLoad
      : player.role === 'クローザー'
        ? balance.closerPitchLoad
        : balance.relieverPitchLoad,
    staminaMultiplier = clamp(
      1 - ((player.p.stam ?? 50) - 50) * balance.staminaLoadAdjustment,
      balance.minimumStaminaMultiplier,
      balance.maximumStaminaMultiplier,
    ),
    consecutivePenalty = Math.max(0, consecutiveGames - 1) * balance.consecutiveAppearancePenalty;
  return (base + pitchCount * pitchLoad) * staminaMultiplier + consecutivePenalty;
}

export function applyPitcherWorkloads(
  team: Team,
  atBatLog: AtBatLogEntry[],
  gameDate?: string,
  startingPitcherId?: string,
): Team {
  if (!gameDate) return team;
  const pitchesByPitcher = new Map<string, number>();
  for (const entry of atBatLog) {
    if (entry.pSide !== team.key || typeof entry.pc !== 'number') continue;
    pitchesByPitcher.set(entry.pitcherId, (pitchesByPitcher.get(entry.pitcherId) ?? 0) + entry.pc);
  }
  return {
    ...team,
    pitchers: team.pitchers.map((pitcher) => {
      const pitchCount = pitchesByPitcher.get(pitcher.id);
      if (pitchCount === undefined) return pitcher;
      const appearanceGap = pitcher.lastPitchedOn
          ? calendarDaysBetween(pitcher.lastPitchedOn, gameDate)
          : Number.POSITIVE_INFINITY,
        consecutiveGames = appearanceGap <= 1 ? (pitcher.consecutivePitchingGames ?? 0) + 1 : 1;
      return {
        ...pitcher,
        fatigue: clamp(
          (pitcher.fatigue ?? 0) +
            workloadFor(pitcher, pitchCount, consecutiveGames, pitcher.id === startingPitcherId),
          0,
          100,
        ),
        fatigueUpdatedOn: gameDate,
        lastPitchedOn: gameDate,
        consecutivePitchingGames: consecutiveGames,
      };
    }),
  };
}

export function isPitcherSelectable(player: Player, emergency = false): boolean {
  const maximum = emergency
    ? PITCHER_USAGE_BALANCE.fatigue.emergencyMaximum
    : PITCHER_USAGE_BALANCE.fatigue.maximumSelectable;
  return !player.isP || ((player.injuryDays ?? 0) <= 0 && (player.fatigue ?? 0) < maximum);
}

export function bullpenSelectionScore(player: Player): number {
  return (
    calcOVR(player) -
    (player.fatigue ?? 0) * PITCHER_USAGE_BALANCE.fatigue.selectionPenaltyPerPoint -
    Math.max(0, (player.consecutivePitchingGames ?? 0) - 1) *
      PITCHER_USAGE_BALANCE.fatigue.consecutiveAppearancePenalty
  );
}
