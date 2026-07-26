import type { GameBoxScore, GameSummary } from './boxScore';
import type { PitcherPlanInput } from './pitcherPlan';
import { skipGames } from './season';
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
  const hasPlan = pitcherPlan.rotationOrder.length > 0 || pitcherPlan.closerPriority.length > 0;
  return skipGames(
    schedule,
    teams,
    rotationNumbers,
    playerTeam,
    mode,
    accumulatedStats,
    seasonStatsSoFar,
    hasPlan ? pitcherPlan : null,
  );
}
