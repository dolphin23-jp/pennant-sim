import type { PlayerStats } from './types';

export const STATS_QUALIFICATION = {
  plateAppearancesPerTeamGame: 3.1,
  inningsPerTeamGame: 1,
  fullSeasonTeamGames: 143,
} as const;

export function requiredPlateAppearances(teamGames: number): number {
  return Math.ceil(Math.max(0, teamGames) * STATS_QUALIFICATION.plateAppearancesPerTeamGame);
}

export function requiredPitchingOuts(teamGames: number): number {
  return Math.ceil(
    Math.max(0, teamGames) * STATS_QUALIFICATION.inningsPerTeamGame * 3,
  );
}

export function qualifiesForRate(stats: PlayerStats, teamGames: number): boolean {
  if (teamGames <= 0) return false;
  return stats.type === 'bat'
    ? stats.pa >= requiredPlateAppearances(teamGames)
    : stats.ip3 >= requiredPitchingOuts(teamGames);
}
