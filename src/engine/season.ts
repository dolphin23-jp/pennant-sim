import { CENTRAL, PACIFIC, TINFO } from '../data';
import { buildGameBoxScore, isNotableGame, toSummary } from './boxScore';
import type { GameBoxScore, GameSummary } from './boxScore';
import { simulateGame } from './game';
import type { PitcherPlanInput } from './pitcherPlan';
import { random, uid } from './random';
import { accumulateStats, accumulateStatsAll, mergeStatMaps } from './stats';
import type {
  AccumulatedStats,
  ScheduleGame,
  StandingRecord,
  TeamForm,
  TeamKey,
  Teams,
} from './types';

export interface ScheduleGenerationOptions {
  rainoutRate?: number;
  maxRainouts?: number;
}

export const addDays = (dateString: string, days: number): string => {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const sortSchedule = (schedule: ScheduleGame[]): ScheduleGame[] =>
  [...schedule].sort(
    (first, second) =>
      first.date.localeCompare(second.date) ||
      (first.doubleHeaderGame ?? 0) - (second.doubleHeaderGame ?? 0),
  );

const involvesTeam = (game: ScheduleGame, teamKey: TeamKey): boolean =>
  game.homeKey === teamKey || game.awayKey === teamKey;

const isSameMatchup = (first: ScheduleGame, second: ScheduleGame): boolean =>
  first.homeKey === second.homeKey && first.awayKey === second.awayKey;

export function postponeScheduleGame(
  schedule: ScheduleGame[],
  gameId: string,
  preferredDate?: string,
): ScheduleGame[] {
  const nextSchedule = schedule.map((game) => ({ ...game })),
    postponedGame = nextSchedule.find((game) => game.id === gameId);
  if (!postponedGame || postponedGame.played) return sortSchedule(nextSchedule);

  const postponedFrom = postponedGame.date,
    dateIsAvailable = (date: string): boolean =>
      !nextSchedule.some(
        (game) =>
          game.id !== postponedGame.id &&
          game.date === date &&
          (involvesTeam(game, postponedGame.homeKey) || involvesTeam(game, postponedGame.awayKey)),
      );

  let doubleHeaderPartner: ScheduleGame | undefined;
  if (preferredDate && preferredDate > postponedFrom) {
    doubleHeaderPartner = nextSchedule.find(
      (game) =>
        game.id !== postponedGame.id &&
        !game.played &&
        game.date === preferredDate &&
        !game.doubleHeaderGame &&
        isSameMatchup(game, postponedGame),
    );
  }
  if (!doubleHeaderPartner) {
    doubleHeaderPartner = nextSchedule
      .filter(
        (game) =>
          game.id !== postponedGame.id &&
          !game.played &&
          game.date > postponedFrom &&
          !game.doubleHeaderGame &&
          isSameMatchup(game, postponedGame),
      )
      .sort((first, second) => first.date.localeCompare(second.date))[0];
  }

  let rescheduledDate = doubleHeaderPartner?.date;
  if (
    !rescheduledDate &&
    preferredDate &&
    preferredDate > postponedFrom &&
    dateIsAvailable(preferredDate)
  ) {
    rescheduledDate = preferredDate;
  }
  if (!rescheduledDate) {
    for (let offset = 1; offset <= 45; offset += 1) {
      const candidateDate = addDays(postponedFrom, offset);
      if (dateIsAvailable(candidateDate)) {
        rescheduledDate = candidateDate;
        break;
      }
    }
  }
  if (!rescheduledDate) {
    const lastDate = nextSchedule.reduce(
      (latest, game) => (game.date > latest ? game.date : latest),
      postponedFrom,
    );
    let offset = 1;
    rescheduledDate = addDays(lastDate, offset);
    while (!dateIsAvailable(rescheduledDate)) {
      offset += 1;
      rescheduledDate = addDays(lastDate, offset);
    }
  }

  postponedGame.originalDate ??= postponedFrom;
  postponedGame.postponedFrom = postponedFrom;
  postponedGame.date = rescheduledDate;
  postponedGame.doubleHeaderGame = doubleHeaderPartner ? 2 : null;
  if (doubleHeaderPartner) doubleHeaderPartner.doubleHeaderGame = 1;

  return sortSchedule(nextSchedule);
}

function applyRainouts(
  schedule: ScheduleGame[],
  rainoutRate: number,
  maxRainouts: number,
): ScheduleGame[] {
  if (rainoutRate <= 0 || maxRainouts <= 0) return sortSchedule(schedule);
  let nextSchedule = sortSchedule(schedule),
    rainouts = 0;
  const candidateIds = nextSchedule.map((game) => game.id);
  for (const gameId of candidateIds) {
    if (rainouts >= maxRainouts) break;
    const game = nextSchedule.find((candidate) => candidate.id === gameId);
    if (!game || game.postponedFrom || game.doubleHeaderGame || random() >= rainoutRate) continue;
    nextSchedule = postponeScheduleGame(nextSchedule, gameId);
    rainouts += 1;
  }
  return sortSchedule(nextSchedule);
}

interface SeriesUnit {
  home: TeamKey;
  away: TeamKey;
  games: number;
  type: 'league' | 'interleague';
}

/** Break a season's worth of meetings at one venue into realistic 2-4 game series
 * blocks (mostly 3), the way NPB actually groups games instead of one meeting a day. */
function chunkSeriesLengths(total: number): number[] {
  const lengths: number[] = [];
  let remaining = total;
  while (remaining > 0) {
    const length = Math.min(3, remaining);
    lengths.push(length);
    remaining -= length;
  }
  const last = lengths[lengths.length - 1];
  if (lengths.length > 1 && last !== undefined && last < 3) {
    lengths.pop();
    lengths[lengths.length - 1] = (lengths[lengths.length - 1] as number) + last;
  }
  return lengths;
}

function shuffleInPlace<T>(items: T[]): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [items[index], items[swap]] = [items[swap] as T, items[index] as T];
  }
}

/** 125 same-league games per team: 13 home / 12 away against each of the other five
 * clubs, same as before - just grouped into series instead of individual entries. */
function buildLeagueSeries(league: readonly TeamKey[]): SeriesUnit[] {
  const series: SeriesUnit[] = [];
  for (let first = 0; first < league.length; first += 1) {
    for (let second = first + 1; second < league.length; second += 1) {
      const teamA = league[first] as TeamKey,
        teamB = league[second] as TeamKey;
      for (const games of chunkSeriesLengths(13))
        series.push({ home: teamA, away: teamB, games, type: 'league' });
      for (const games of chunkSeriesLengths(12))
        series.push({ home: teamB, away: teamA, games, type: 'league' });
    }
  }
  return series;
}

/** 18 interleague games per team: one clean 3-game series against each of the other
 * league's six clubs, hosted at a single venue and balanced to 9 home / 9 away. */
function buildInterleagueSeries(): SeriesUnit[] {
  const series: SeriesUnit[] = [];
  CENTRAL.forEach((central, centralIndex) => {
    PACIFIC.forEach((pacific, pacificIndex) => {
      const centralHosts = (centralIndex + pacificIndex) % 2 === 0;
      series.push({
        home: centralHosts ? central : pacific,
        away: centralHosts ? pacific : central,
        games: 3,
        type: 'interleague',
      });
    });
  });
  return series;
}

/** Monday is the league's default off day: a series may only start on a day whose whole
 * span avoids it, the same way a real series never gets scheduled to play through one. */
function spanIncludesMonday(start: Date, day: number, games: number): boolean {
  for (let offset = 0; offset < games; offset += 1) {
    const gameDate = new Date(start);
    gameDate.setDate(gameDate.getDate() + day + offset);
    if (gameDate.getDay() === 1) return true;
  }
  return false;
}

/** Start every series in `pool` whose two teams are both free today and whose full run
 * avoids Monday, marking them busy through the series and removing it from the pool.
 * Mutates `freeToday`/`busyUntil`. */
function fillDayFromPool(
  pool: SeriesUnit[],
  day: number,
  start: Date,
  freeToday: Set<TeamKey>,
  busyUntil: Record<TeamKey, number>,
  schedule: ScheduleGame[],
): void {
  for (let index = pool.length - 1; index >= 0; index -= 1) {
    const unit = pool[index] as SeriesUnit;
    if (!freeToday.has(unit.home) || !freeToday.has(unit.away)) continue;
    if (spanIncludesMonday(start, day, unit.games)) continue;
    for (let offset = 0; offset < unit.games; offset += 1) {
      const gameDate = new Date(start);
      gameDate.setDate(gameDate.getDate() + day + offset);
      const dateString = gameDate.toISOString().slice(0, 10);
      schedule.push({
        id: uid(),
        date: dateString,
        originalDate: dateString,
        postponedFrom: null,
        doubleHeaderGame: null,
        homeKey: unit.home,
        awayKey: unit.away,
        played: false,
        hs: null,
        as: null,
        seriesType: unit.type,
        isInterleague: unit.type === 'interleague',
      });
    }
    busyUntil[unit.home] = day + unit.games;
    busyUntil[unit.away] = day + unit.games;
    freeToday.delete(unit.home);
    freeToday.delete(unit.away);
    pool.splice(index, 1);
  }
}

// Interleague clusters into a single mid-season window (day index, roughly two months
// in - late May in a season starting late March) instead of being scattered evenly
// across the whole year. Once it drains, a break of ALL_STAR_BREAK_LENGTH days with no
// games at all stands in for the All-Star break (no games are simulated for it - it's a
// pure rest window, which matters once a fatigue system needs real off-days to recover
// against).
const INTERLEAGUE_WINDOW_START = 58;
const ALL_STAR_BREAK_MINIMUM_GAP = 28;
const ALL_STAR_BREAK_LENGTH = 9;
const SCHEDULING_DAY_LIMIT = 500;

export function generateSchedule(
  year: number,
  options: ScheduleGenerationOptions = {},
): ScheduleGame[] {
  const leagueSeries = [...buildLeagueSeries(CENTRAL), ...buildLeagueSeries(PACIFIC)],
    interleagueSeries = buildInterleagueSeries();
  shuffleInPlace(leagueSeries);
  shuffleInPlace(interleagueSeries);

  const schedule: ScheduleGame[] = [],
    start = new Date(year, 2, 28),
    teamKeys = Object.keys(TINFO) as TeamKey[],
    busyUntil = Object.fromEntries(teamKeys.map((key) => [key, 0])) as Record<TeamKey, number>;
  let day = 0,
    interleagueFinishedDay: number | null = null,
    allStarBreakInserted = false;

  while (leagueSeries.length > 0 || interleagueSeries.length > 0) {
    if (day > SCHEDULING_DAY_LIMIT) throw new Error('Schedule generation exceeded its day limit.');
    const date = new Date(start);
    date.setDate(date.getDate() + day);
    const isMonday = date.getDay() === 1;

    if (
      !allStarBreakInserted &&
      interleagueFinishedDay !== null &&
      day >= interleagueFinishedDay + ALL_STAR_BREAK_MINIMUM_GAP
    ) {
      day += ALL_STAR_BREAK_LENGTH;
      allStarBreakInserted = true;
      continue;
    }

    if (isMonday) {
      day += 1;
      continue;
    }

    const freeToday = new Set<TeamKey>(teamKeys.filter((key) => (busyUntil[key] ?? 0) <= day)),
      inInterleaguePhase =
        day >= INTERLEAGUE_WINDOW_START &&
        (interleagueSeries.length > 0 ||
          (interleagueFinishedDay !== null && day < interleagueFinishedDay));

    // Do not leak interleague games into the regular league calendar (or vice versa).
    // Once the interleague block starts it owns the calendar until every already-started
    // series has finished; rainouts may still move individual games later afterwards.
    if (inInterleaguePhase) fillDayFromPool(interleagueSeries, day, start, freeToday, busyUntil, schedule);
    else fillDayFromPool(leagueSeries, day, start, freeToday, busyUntil, schedule);

    if (day >= INTERLEAGUE_WINDOW_START && interleagueFinishedDay === null && interleagueSeries.length === 0) {
      interleagueFinishedDay = Math.max(
        day + 1,
        ...teamKeys.map((teamKey) => busyUntil[teamKey] ?? day + 1),
      );
    }

    day += 1;
    if (!isMonday && random() < 0.12) day += 1;
  }

  const rainoutRate = Math.max(0, Math.min(1, options.rainoutRate ?? 0.015)),
    maxRainouts = Math.max(0, Math.floor(options.maxRainouts ?? 12));
  return applyRainouts(sortSchedule(schedule), rainoutRate, maxRainouts);
}

function tallyRecords(schedule: ScheduleGame[]): Record<TeamKey, StandingRecord> {
  const records = Object.fromEntries(
    Object.keys(TINFO).map((key) => [key, { w: 0, l: 0, d: 0, rs: 0, ra: 0, g: 0 }]),
  ) as Record<TeamKey, StandingRecord>;
  for (const game of schedule.filter((candidate) => candidate.played)) {
    const home = records[game.homeKey],
      away = records[game.awayKey],
      homeScore = game.hs ?? 0,
      awayScore = game.as ?? 0;
    home.rs += homeScore;
    home.ra += awayScore;
    home.g += 1;
    away.rs += awayScore;
    away.ra += homeScore;
    away.g += 1;
    if (homeScore > awayScore) {
      home.w += 1;
      away.l += 1;
    } else if (awayScore > homeScore) {
      away.w += 1;
      home.l += 1;
    } else {
      home.d += 1;
      away.d += 1;
    }
  }
  return records;
}

/** Rank one group of teams against each other by winning percentage, filling in `pct`,
 * `gb` (behind the group's own leader) and `rank`. Mutates `records` in place. */
function rankGroup(records: Record<TeamKey, StandingRecord>, group: readonly TeamKey[]): void {
  const sorted = [...group].sort((a, b) => {
      const first = records[a],
        second = records[b],
        firstPct = first.w + first.l > 0 ? first.w / (first.w + first.l) : 0,
        secondPct = second.w + second.l > 0 ? second.w / (second.w + second.l) : 0;
      return secondPct - firstPct;
    }),
    leader = records[sorted[0] as TeamKey];
  sorted.forEach((teamKey, index) => {
    const record = records[teamKey];
    record.pct = record.w + record.l > 0 ? record.w / (record.w + record.l) : 0;
    record.gb = index === 0 ? '-' : ((leader.w - record.w + record.l - leader.l) / 2).toFixed(1);
    record.rank = index + 1;
  });
}

export function calcStandings(schedule: ScheduleGame[]): Record<TeamKey, StandingRecord> {
  const records = tallyRecords(schedule);
  rankGroup(records, CENTRAL);
  rankGroup(records, PACIFIC);
  return records;
}

/** 交流戦 standings: a single combined ranking across all 12 clubs, restricted to
 * interleague games only (unlike the regular pennant race, Central and Pacific aren't
 * ranked separately here). */
export function calcInterleagueStandings(
  schedule: ScheduleGame[],
): Record<TeamKey, StandingRecord> {
  const records = tallyRecords(schedule.filter((game) => game.isInterleague));
  rankGroup(records, [...CENTRAL, ...PACIFIC]);
  return records;
}

export interface HeadToHeadRecord {
  w: number;
  l: number;
  d: number;
}

/** 星取表: each team's win/loss/draw record against every other given team. Symmetric -
 * `matrix[a][b]` and `matrix[b][a]` are two sides of the same games. */
export function buildHeadToHeadMatrix(
  schedule: ScheduleGame[],
  teamKeys: readonly TeamKey[],
): Record<TeamKey, Record<TeamKey, HeadToHeadRecord>> {
  const included = new Set<TeamKey>(teamKeys);
  const matrix = Object.fromEntries(
    teamKeys.map((key) => [
      key,
      Object.fromEntries(
        teamKeys.map((opponent) => [opponent, { w: 0, l: 0, d: 0 }]),
      ) as Record<TeamKey, HeadToHeadRecord>,
    ]),
  ) as Record<TeamKey, Record<TeamKey, HeadToHeadRecord>>;
  for (const game of schedule) {
    if (!game.played || !included.has(game.homeKey) || !included.has(game.awayKey)) continue;
    const homeScore = game.hs ?? 0,
      awayScore = game.as ?? 0;
    if (homeScore === awayScore) {
      matrix[game.homeKey][game.awayKey].d += 1;
      matrix[game.awayKey][game.homeKey].d += 1;
    } else if (homeScore > awayScore) {
      matrix[game.homeKey][game.awayKey].w += 1;
      matrix[game.awayKey][game.homeKey].l += 1;
    } else {
      matrix[game.awayKey][game.homeKey].w += 1;
      matrix[game.homeKey][game.awayKey].l += 1;
    }
  }
  return matrix;
}

/** Rough calendar offsets for a knockout series' games, with a rest/travel day worked in
 * roughly every third game the way the real Climax Series and Japan Series pace
 * themselves - so postseason games have real dates (and real gaps) instead of resolving
 * instantly with no calendar position at all. Sized to the series' actual game count,
 * not just the "typical" best-of length, so a rare tie-heavy series that runs long still
 * gets a date for every game it plays. */
export function postseasonSeriesDates(startDate: string, gameCount: number): string[] {
  const dates: string[] = [];
  let offset = 0;
  for (let index = 0; index < gameCount; index += 1) {
    if (index > 0 && index % 3 === 0) offset += 1;
    dates.push(addDays(startDate, offset));
    offset += 1;
  }
  return dates;
}

type TeamGameResult = 'w' | 'l' | 'd';
type FormRecord = TeamForm['last10'];

function teamResult(game: ScheduleGame, teamKey: TeamKey): TeamGameResult {
  const homeScore = game.hs ?? 0;
  const awayScore = game.as ?? 0;
  if (homeScore === awayScore) return 'd';
  const teamWon =
    (game.homeKey === teamKey && homeScore > awayScore) ||
    (game.awayKey === teamKey && awayScore > homeScore);
  return teamWon ? 'w' : 'l';
}

function countResults(games: ScheduleGame[], teamKey: TeamKey): FormRecord {
  return games.reduce<FormRecord>(
    (record, game) => {
      const result = teamResult(game, teamKey);
      record[result] += 1;
      return record;
    },
    { w: 0, l: 0, d: 0 },
  );
}

export function deriveTeamForm(schedule: ScheduleGame[], teamKey: TeamKey): TeamForm {
  const games = sortSchedule(schedule.filter((game) => game.played && involvesTeam(game, teamKey)));
  const latestResult = games.length
    ? teamResult(games[games.length - 1] as ScheduleGame, teamKey)
    : null;
  let streakCount = 0;
  if (latestResult) {
    for (let index = games.length - 1; index >= 0; index -= 1) {
      const game = games[index];
      if (!game || teamResult(game, teamKey) !== latestResult) break;
      streakCount += 1;
    }
  }
  const streak =
    latestResult === 'w'
      ? `${streakCount}連勝`
      : latestResult === 'l'
        ? `${streakCount}連敗`
        : latestResult === 'd'
          ? `${streakCount}分`
          : '-';

  return {
    streak,
    last10: countResults(games.slice(-10), teamKey),
    home: countResults(
      games.filter((game) => game.homeKey === teamKey),
      teamKey,
    ),
    away: countResults(
      games.filter((game) => game.awayKey === teamKey),
      teamKey,
    ),
  };
}

export function simCpuUntilNext(
  schedule: ScheduleGame[],
  teams: Teams,
  rotationNumbers: Record<TeamKey, number>,
  playerTeam: TeamKey,
  accumulatedStats: AccumulatedStats = {},
  seasonStatsSoFar: AccumulatedStats = {},
): {
  sched: ScheduleGame[];
  rotN: Record<TeamKey, number>;
  leagueDistStats: AccumulatedStats;
  gameSummaries: Record<string, GameSummary>;
  gameBoxScores: Record<string, GameBoxScore>;
} {
  const nextSchedule = [...schedule],
    nextRotations = { ...rotationNumbers };
  let leagueStats: AccumulatedStats = {};
  const gameSummaries: Record<string, GameSummary> = {};
  const gameBoxScores: Record<string, GameBoxScore> = {};
  const nextPlayerGame = nextSchedule.find(
    (game) => !game.played && (game.homeKey === playerTeam || game.awayKey === playerTeam),
  );
  for (let index = 0; index < nextSchedule.length; index += 1) {
    const game = nextSchedule[index] as ScheduleGame;
    if (game.played) continue;
    if (nextPlayerGame && game.id === nextPlayerGame.id) break;
    const seasonStatsBeforeThisGame = mergeStatMaps(seasonStatsSoFar, leagueStats);
    const result = simulateGame(
      game.homeKey,
      game.awayKey,
      teams,
      null,
      null,
      nextRotations[game.homeKey] || 0,
      nextRotations[game.awayKey] || 0,
      accumulatedStats,
      null,
      null,
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
    const involvesPlayer = game.homeKey === playerTeam || game.awayKey === playerTeam;
    if (involvesPlayer || isNotableGame(box)) gameBoxScores[game.id] = box;
    nextRotations[game.homeKey] = (nextRotations[game.homeKey] || 0) + 1;
    nextRotations[game.awayKey] = (nextRotations[game.awayKey] || 0) + 1;
  }
  return {
    sched: nextSchedule,
    rotN: nextRotations,
    leagueDistStats: leagueStats,
    gameSummaries,
    gameBoxScores,
  };
}

export function skipGames(
  schedule: ScheduleGame[],
  teams: Teams,
  rotationNumbers: Record<TeamKey, number>,
  playerTeam: TeamKey,
  mode: 'next' | 'week' | 'month' | 'season',
  accumulatedStats: AccumulatedStats = {},
  seasonStatsSoFar: AccumulatedStats = {},
  pitcherPlan: PitcherPlanInput | null = null,
): {
  sched: ScheduleGame[];
  rotN: Record<TeamKey, number>;
  distStats: AccumulatedStats;
  leagueDistStats: AccumulatedStats;
  gameSummaries: Record<string, GameSummary>;
  gameBoxScores: Record<string, GameBoxScore>;
} {
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
      homePlan = pitcherPlan && game.homeKey === playerTeam ? pitcherPlan : null,
      awayPlan = pitcherPlan && game.awayKey === playerTeam ? pitcherPlan : null,
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
