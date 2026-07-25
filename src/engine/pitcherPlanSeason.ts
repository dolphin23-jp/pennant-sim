import { buildGameBoxScore, isNotableGame, toSummary } from './boxScore';
import type { GameBoxScore, GameSummary } from './boxScore';
import { simulateGame } from './game';
import type { PitcherPlanInput } from './pitcherPlan';
import { skipGames } from './season';
import { accumulateStats, accumulateStatsAll, mergeStatMaps } from './stats';
import type { AccumulatedStats, ScheduleGame, TeamKey, Teams } from './types';

export function skipGamesWithPitcherPlan(
  schedule: ScheduleGame[],
  teams: Teams,
  rotationNumbers: Record<TeamKey, number>,
  playerTeam: TeamKey,
  mode: 'next' | 'week' | 'month' | 'season',
  accumulatedStats: AccumulatedStats = {},
  pitcherPlan: PitcherPlanInput = { rotationOrder: [], closerPriority: [] },
  seasonStatsSoFar: AccumulatedStats = {},
): {
  sched: ScheduleGame[];
  rotN: Record<TeamKey, number>;
  distStats: AccumulatedStats;
  leagueDistStats: AccumulatedStats;
  gameSummaries: Record<string, GameSummary>;
  gameBoxScores: Record<string, GameBoxScore>;
} {
  if (!pitcherPlan.rotationOrder.length && !pitcherPlan.closerPriority.length) {
    return skipGames(
      schedule,
      teams,
      rotationNumbers,
      playerTeam,
      mode,
      accumulatedStats,
      seasonStatsSoFar,
    );
  }

  const nextSchedule = [...schedule],
    nextRotations = { ...rotationNumbers };
  let distributedStats: AccumulatedStats = {},
    leagueStats: AccumulatedStats = {};
  const gameSummaries: Record<string, GameSummary> = {};
  const gameBoxScores: Record<string, GameBoxScore> = {};
  const remaining = nextSchedule.filter(
      (game) => !game.played && (game.homeKey === playerTeam || game.awayKey === playerTeam),
    ),
    target =
      mode === 'next'
        ? 1
        : mode === 'week'
          ? Math.min(5, remaining.length)
          : mode === 'month'
            ? Math.min(25, remaining.length)
            : remaining.length;
  let skipped = 0;
  for (let index = 0; index < nextSchedule.length && skipped < target; index += 1) {
    const game = nextSchedule[index] as ScheduleGame;
    if (game.played) continue;
    const playerGame = game.homeKey === playerTeam || game.awayKey === playerTeam,
      homePlan = game.homeKey === playerTeam ? pitcherPlan : null,
      awayPlan = game.awayKey === playerTeam ? pitcherPlan : null,
      seasonStatsBeforeThisGame = mergeStatMaps(seasonStatsSoFar, leagueStats),
      result = simulateGame(
        game.homeKey,
        game.awayKey,
        teams,
        null,
        null,
        nextRotations[game.homeKey] || 0,
        nextRotations[game.awayKey] || 0,
        accumulatedStats,
        homePlan,
        awayPlan,
        game.date,
      );
    nextSchedule[index] = { ...game, played: true, hs: result.score.home, as: result.score.away };
    leagueStats = accumulateStatsAll(result, leagueStats);
    const box = buildGameBoxScore(
      result,
      game.id,
      game.date,
      Number(game.date.slice(0, 4)),
      seasonStatsBeforeThisGame,
    );
    gameSummaries[game.id] = toSummary(box);
    if (playerGame || isNotableGame(box)) gameBoxScores[game.id] = box;
    if (playerGame) {
      distributedStats = accumulateStats(result, playerTeam, distributedStats);
      skipped += 1;
    }
    nextRotations[game.homeKey] = (nextRotations[game.homeKey] || 0) + 1;
    nextRotations[game.awayKey] = (nextRotations[game.awayKey] || 0) + 1;
  }
  return {
    sched: nextSchedule,
    rotN: nextRotations,
    distStats: distributedStats,
    leagueDistStats: leagueStats,
    gameSummaries,
    gameBoxScores,
  };
}
