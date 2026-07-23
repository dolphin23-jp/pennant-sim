import { CENTRAL, PACIFIC, TINFO } from '../data';
import { simulateGame } from './game';
import { random, uid } from './random';
import { accumulateStats, accumulateStatsAll } from './stats';
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

const addDays = (dateString: string, days: number): string => {
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
  if (!rescheduledDate && preferredDate && preferredDate > postponedFrom && dateIsAvailable(preferredDate)) {
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

export function generateSchedule(
  year: number,
  options: ScheduleGenerationOptions = {},
): ScheduleGame[] {
  const intra: Array<{ h: TeamKey; a: TeamKey; type: 'league' }> = [],
    inter: Array<{ h: TeamKey; a: TeamKey; type: 'interleague' }> = [];
  for (const league of [CENTRAL, PACIFIC])
    for (let first = 0; first < league.length; first += 1)
      for (let second = first + 1; second < league.length; second += 1) {
        for (let game = 0; game < 13; game += 1)
          intra.push({ h: league[first] as TeamKey, a: league[second] as TeamKey, type: 'league' });
        for (let game = 0; game < 12; game += 1)
          intra.push({ h: league[second] as TeamKey, a: league[first] as TeamKey, type: 'league' });
      }
  CENTRAL.forEach((central, centralIndex) =>
    PACIFIC.forEach((pacific, pacificIndex) => {
      const centralHosts = (centralIndex + pacificIndex) % 2 === 0;
      inter.push({
        h: centralHosts ? central : pacific,
        a: centralHosts ? pacific : central,
        type: 'interleague',
      });
      inter.push({
        h: centralHosts ? central : pacific,
        a: centralHosts ? pacific : central,
        type: 'interleague',
      });
      inter.push({
        h: centralHosts ? pacific : central,
        a: centralHosts ? central : pacific,
        type: 'interleague',
      });
    }),
  );
  for (let index = intra.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [intra[index], intra[swap]] = [
      intra[swap] as (typeof intra)[number],
      intra[index] as (typeof intra)[number],
    ];
  }
  for (let index = inter.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [inter[index], inter[swap]] = [
      inter[swap] as (typeof inter)[number],
      inter[index] as (typeof inter)[number],
    ];
  }
  const schedule: ScheduleGame[] = [],
    start = new Date(year, 2, 28);
  let day = 0;
  while (intra.length || inter.length) {
    const date = new Date(start);
    date.setDate(date.getDate() + day);
    const dateString = date.toISOString().slice(0, 10),
      inInterleague = day >= 62 && day <= 79,
      pool = inInterleague && inter.length ? inter : intra.length ? intra : inter,
      used = new Set<TeamKey>(),
      today: Array<(typeof pool)[number]> = [];
    for (let index = pool.length - 1; index >= 0 && today.length < 6; index -= 1) {
      const game = pool[index] as (typeof pool)[number];
      if (!used.has(game.h) && !used.has(game.a)) {
        used.add(game.h);
        used.add(game.a);
        today.push(pool.splice(index, 1)[0] as (typeof pool)[number]);
      }
    }
    if (!today.length) {
      day += 1;
      continue;
    }
    for (const game of today)
      schedule.push({
        id: uid(),
        date: dateString,
        originalDate: dateString,
        postponedFrom: null,
        doubleHeaderGame: null,
        homeKey: game.h,
        awayKey: game.a,
        played: false,
        hs: null,
        as: null,
        seriesType: game.type,
        isInterleague: game.type === 'interleague',
      });
    day += 1;
    if (date.getDay() === 1 || random() < 0.08) day += 1;
  }

  const rainoutRate = Math.max(0, Math.min(1, options.rainoutRate ?? 0.015)),
    maxRainouts = Math.max(0, Math.floor(options.maxRainouts ?? 12));
  return applyRainouts(schedule, rainoutRate, maxRainouts);
}

export function calcStandings(schedule: ScheduleGame[]): Record<TeamKey, StandingRecord> {
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
  for (const league of [CENTRAL, PACIFIC]) {
    const sorted = [...league].sort((a, b) => {
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
  return records;
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
  const games = sortSchedule(
    schedule.filter((game) => game.played && involvesTeam(game, teamKey)),
  );
  const latestResult = games.length ? teamResult(games[games.length - 1] as ScheduleGame, teamKey) : null;
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
    home: countResults(games.filter((game) => game.homeKey === teamKey), teamKey),
    away: countResults(games.filter((game) => game.awayKey === teamKey), teamKey),
  };
}

export function simCpuUntilNext(
  schedule: ScheduleGame[],
  teams: Teams,
  rotationNumbers: Record<TeamKey, number>,
  playerTeam: TeamKey,
  accumulatedStats: AccumulatedStats = {},
): { sched: ScheduleGame[]; rotN: Record<TeamKey, number>; leagueDistStats: AccumulatedStats } {
  const nextSchedule = [...schedule],
    nextRotations = { ...rotationNumbers };
  let leagueStats: AccumulatedStats = {};
  const nextPlayerGame = nextSchedule.find(
    (game) => !game.played && (game.homeKey === playerTeam || game.awayKey === playerTeam),
  );
  for (let index = 0; index < nextSchedule.length; index += 1) {
    const game = nextSchedule[index] as ScheduleGame;
    if (game.played) continue;
    if (nextPlayerGame && game.id === nextPlayerGame.id) break;
    const result = simulateGame(
      game.homeKey,
      game.awayKey,
      teams,
      null,
      null,
      nextRotations[game.homeKey] || 0,
      nextRotations[game.awayKey] || 0,
      accumulatedStats,
    );
    nextSchedule[index] = { ...game, played: true, hs: result.score.home, as: result.score.away };
    leagueStats = accumulateStatsAll(result, leagueStats);
    nextRotations[game.homeKey] = (nextRotations[game.homeKey] || 0) + 1;
    nextRotations[game.awayKey] = (nextRotations[game.awayKey] || 0) + 1;
  }
  return { sched: nextSchedule, rotN: nextRotations, leagueDistStats: leagueStats };
}

export function skipGames(
  schedule: ScheduleGame[],
  teams: Teams,
  rotationNumbers: Record<TeamKey, number>,
  playerTeam: TeamKey,
  mode: 'next' | 'week' | 'month' | 'season',
  accumulatedStats: AccumulatedStats = {},
): {
  sched: ScheduleGame[];
  rotN: Record<TeamKey, number>;
  distStats: AccumulatedStats;
  leagueDistStats: AccumulatedStats;
} {
  const nextSchedule = [...schedule],
    nextRotations = { ...rotationNumbers };
  let distributedStats: AccumulatedStats = {},
    leagueStats: AccumulatedStats = {};
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
      result = simulateGame(
        game.homeKey,
        game.awayKey,
        teams,
        null,
        null,
        nextRotations[game.homeKey] || 0,
        nextRotations[game.awayKey] || 0,
        accumulatedStats,
      );
    nextSchedule[index] = { ...game, played: true, hs: result.score.home, as: result.score.away };
    leagueStats = accumulateStatsAll(result, leagueStats);
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
  };
}
