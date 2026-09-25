import { CENTRAL, PACIFIC } from '../data';
import type { NarrativeEvent } from '../narrative/types';
import { simulateGame } from './game';
import { narrativeEventsFromPostGame } from './narrativeEvents';
import { addDays, postseasonSeriesDates } from './season';
import type { AccumulatedStats, ScheduleGame, StandingRecord, TeamKey, Teams } from './types';

export interface SeriesGame {
  game: number;
  date: string;
  home: TeamKey;
  away: TeamKey;
  homeScore: number;
  awayScore: number;
  winner: TeamKey | null;
}

export interface SeriesResult {
  narrativeEvents: NarrativeEvent[];
  first: TeamKey;
  second: TeamKey;
  firstWins: number;
  secondWins: number;
  winner: TeamKey;
  games: SeriesGame[];
}

export interface PostseasonResults {
  centralFirst: SeriesResult;
  centralFinal: SeriesResult;
  pacificFirst: SeriesResult;
  pacificFinal: SeriesResult;
  japanSeries: SeriesResult;
}

// Rest/travel gaps between postseason rounds, matching the real Climax
// Series/Japan Series calendar rather than everything resolving on one day.
const REGULAR_SEASON_TO_FIRST_STAGE_GAP = 6;
const FIRST_STAGE_TO_FINAL_STAGE_GAP = 4;
const FINAL_STAGE_TO_JAPAN_SERIES_GAP = 5;

export function simulateSeries(
  first: TeamKey,
  second: TeamKey,
  bestOf: number,
  teams: Teams,
  // Carrying the regular season's totals keeps in-season mastery continuous into the
  // playoffs; passing {} would reset every player to opening mastery mid-year.
  accumulated: AccumulatedStats,
  startDate: string,
  firstAdvantage = 0,
): SeriesResult {
  const target = Math.ceil(bestOf / 2);
  let firstWins = firstAdvantage;
  let secondWins = 0;
  let firstRotation = 0;
  let secondRotation = 0;
  let gameNumber = 1;
  const narrativeEvents: NarrativeEvent[] = [];
  const games: SeriesGame[] = [],
    // Sized to the defensive game-count cap below, so even a rare tie-heavy series that
    // runs past a "normal" bestOf length still has a real date for every game it plays.
    dates = postseasonSeriesDates(startDate, bestOf + 8);

  while (firstWins < target && secondWins < target && gameNumber <= bestOf + 8) {
    const home = gameNumber % 2 === 1 ? first : second;
    const away = home === first ? second : first;
    const result = simulateGame(
      home,
      away,
      teams,
      null,
      null,
      home === first ? firstRotation : secondRotation,
      away === first ? firstRotation : secondRotation,
      accumulated,
    );
    narrativeEvents.push(
      ...narrativeEventsFromPostGame(
        `postseason:${startDate}:${first}:${second}:${gameNumber}`,
        dates[gameNumber - 1] as string,
        result.postGameEvents,
      ),
    );
    firstRotation += 1;
    secondRotation += 1;
    const winner =
      result.score.home === result.score.away
        ? null
        : result.score.home > result.score.away
          ? home
          : away;
    if (winner === first) firstWins += 1;
    if (winner === second) secondWins += 1;
    games.push({
      game: gameNumber,
      date: dates[gameNumber - 1] as string,
      home,
      away,
      homeScore: result.score.home,
      awayScore: result.score.away,
      winner,
    });
    gameNumber += 1;
  }

  return {
    first,
    second,
    firstWins,
    secondWins,
    narrativeEvents,
    winner: firstWins >= secondWins ? first : second,
    games,
  };
}

/** Climax Series (both leagues) and the Japan Series, in calendar order. */
export function runPostseason(input: {
  /** Rosters the series play on; post-game workload and injuries are written back into it. */
  teams: Teams;
  standings: Record<TeamKey, StandingRecord>;
  schedule: ScheduleGame[];
  year: number;
  leagueAccumulated: AccumulatedStats;
}): PostseasonResults {
  const { teams, standings, schedule, year, leagueAccumulated: league } = input;
  const ranking = (keys: readonly TeamKey[]) =>
    [...keys].sort((a, b) => (standings[a].rank ?? 99) - (standings[b].rank ?? 99));
  const centralRanking = ranking(CENTRAL),
    pacificRanking = ranking(PACIFIC);
  const regularSeasonEnd = schedule.reduce(
    (latest, scheduled) => (scheduled.date > latest ? scheduled.date : latest),
    schedule[0]?.date ?? `${year}-10-01`,
  );
  const firstStageStart = addDays(regularSeasonEnd, REGULAR_SEASON_TO_FIRST_STAGE_GAP);
  const centralFirst = simulateSeries(
    centralRanking[1]!,
    centralRanking[2]!,
    3,
    teams,
    league,
    firstStageStart,
  );
  const pacificFirst = simulateSeries(
    pacificRanking[1]!,
    pacificRanking[2]!,
    3,
    teams,
    league,
    firstStageStart,
  );
  // Both leagues' Final Stage always opens on the same shared date, so it waits for
  // whichever First Stage actually ran longer (a tie can stretch a "best of 3" out).
  const firstStageEnd = [centralFirst, pacificFirst]
    .map((series) => series.games.at(-1)?.date ?? firstStageStart)
    .sort()
    .at(-1) as string;
  const finalStageStart = addDays(firstStageEnd, FIRST_STAGE_TO_FINAL_STAGE_GAP);
  const centralFinal = simulateSeries(
    centralRanking[0]!,
    centralFirst.winner,
    7,
    teams,
    league,
    finalStageStart,
    1,
  );
  const pacificFinal = simulateSeries(
    pacificRanking[0]!,
    pacificFirst.winner,
    7,
    teams,
    league,
    finalStageStart,
    1,
  );
  const finalStageEnd = [centralFinal, pacificFinal]
    .map((series) => series.games.at(-1)?.date ?? finalStageStart)
    .sort()
    .at(-1) as string;
  const japanSeriesStart = addDays(finalStageEnd, FINAL_STAGE_TO_JAPAN_SERIES_GAP);
  const japanSeries = simulateSeries(
    centralFinal.winner,
    pacificFinal.winner,
    7,
    teams,
    league,
    japanSeriesStart,
  );
  return { centralFirst, centralFinal, pacificFirst, pacificFinal, japanSeries };
}

export const postseasonRunnerUp = (results: PostseasonResults): TeamKey =>
  results.japanSeries.winner === results.japanSeries.first
    ? results.japanSeries.second
    : results.japanSeries.first;

export const postseasonNarrativeEvents = (results: PostseasonResults): NarrativeEvent[] =>
  Object.values(results).flatMap((series) => series.narrativeEvents);
