import type { GameSaveData } from './storage';

/** A saved championship is the postseason commit, so reload must not replay it. */
export function resumeSeasonScreen(
  save: Pick<GameSaveData, 'season' | 'championHistory' | 'playerTeam'>,
): 'postseason' | 'offseason' | 'season' | 'teamSelect' {
  const finished = save.season.schedule.length > 0 && save.season.schedule.every((g) => g.played);
  if (finished)
    return save.championHistory.some((c) => c.year === save.season.year)
      ? 'offseason'
      : 'postseason';
  return save.playerTeam ? 'season' : 'teamSelect';
}
