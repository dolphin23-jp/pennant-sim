import process from 'node:process';

import {
  accumulateStatsAll,
  bestLineup,
  calcOVR,
  calcStandings,
  configureRandom,
  generateSchedule,
  initSettledWorld,
  resetRandom,
  simulateGame,
  type AccumulatedStats,
  type ScheduleGame,
  type Team,
  type TeamKey,
} from '../src/engine/index';

/**
 * How strongly team strength turns into runs and wins. Each season opens a freshly settled
 * league (the league a new world opens with) and plays it out with weather disabled.
 * Reports the spread of win% and team runs, the league scoring level, and how much each
 * team trait moves runs scored and allowed (least-squares slope per rating point).
 *
 *   npm run parity -- --seasons 16 --seed 7
 */

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / (values.length || 1);
const standardDeviation = (values: number[]) => {
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
};
const slope = (x: number[], y: number[]) => {
  const mx = average(x),
    my = average(y);
  const covariance = average(x.map((value, index) => (value - mx) * (y[index]! - my)));
  const variance = average(x.map((value) => (value - mx) ** 2));
  return variance ? covariance / variance : 0;
};

function option(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? Number.parseInt(process.argv[index + 1] ?? '', 10) : Number.NaN;
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

interface TeamSeason {
  winPct: number;
  runsScored: number;
  runsAllowed: number;
  defense: number;
  power: number;
  contact: number;
  discipline: number;
  starters: number;
  bullpen: number;
}

function traits(team: Team) {
  const lineup = bestLineup(team);
  const fielders = lineup.filter((player) => !player._isDH);
  const top = (role: (player: Team['pitchers'][number]) => boolean, count: number) =>
    average(
      team.pitchers
        .filter(role)
        .map((player) => calcOVR(player))
        .sort((a, b) => b - a)
        .slice(0, count),
    );
  return {
    defense: average(fielders.map((player) => player.p.df ?? 50)),
    power: average(lineup.map((player) => player.p.pw ?? 50)),
    contact: average(lineup.map((player) => ((player.p.cf ?? 50) + (player.p.cb ?? 50)) / 2)),
    discipline: average(lineup.map((player) => player.p.dc ?? 50)),
    starters: top((player) => player.role === '先発', 6),
    bullpen: top((player) => player.role !== '先発', 7),
  };
}

function simulateSeason(seed: number) {
  let clock = Date.UTC(2026, 0, 1);
  configureRandom(mulberry32(seed), () => clock++);
  const { teams } = initSettledWorld(2026);
  const schedule = generateSchedule(2026, { rainoutRate: 0, maxRainouts: 0 });
  const rotations = Object.fromEntries(Object.keys(teams).map((key) => [key, 0])) as Record<
    TeamKey,
    number
  >;
  const runs = Object.fromEntries(
    Object.keys(teams).map((key) => [key, { scored: 0, allowed: 0 }]),
  ) as Record<TeamKey, { scored: number; allowed: number }>;
  let accumulated: AccumulatedStats = {};
  const played: ScheduleGame[] = [];
  for (const game of schedule) {
    const result = simulateGame(
      game.homeKey,
      game.awayKey,
      teams,
      null,
      null,
      rotations[game.homeKey],
      rotations[game.awayKey],
      accumulated,
      null,
      null,
      game.date,
    );
    accumulated = accumulateStatsAll(result, accumulated);
    rotations[game.homeKey] += 1;
    rotations[game.awayKey] += 1;
    runs[game.homeKey].scored += result.score.home;
    runs[game.homeKey].allowed += result.score.away;
    runs[game.awayKey].scored += result.score.away;
    runs[game.awayKey].allowed += result.score.home;
    played.push({ ...game, played: true, hs: result.score.home, as: result.score.away });
  }
  const standings = calcStandings(played);
  const rows: TeamSeason[] = (Object.keys(teams) as TeamKey[]).map((key) => ({
    winPct: standings[key].w / Math.max(1, standings[key].w + standings[key].l),
    runsScored: runs[key].scored,
    runsAllowed: runs[key].allowed,
    ...traits(teams[key]),
  }));
  const batting = Object.values(accumulated).filter((line) => line.type === 'bat');
  const pitching = Object.values(accumulated).filter((line) => line.type === 'pit');
  const sum = (lines: typeof batting, key: 'h' | 'ab' | 'hr') =>
    lines.reduce((total, line) => total + Number(line[key] ?? 0), 0);
  const qualifiedBatters = batting.filter((line) => line.pa >= 443);
  const qualifiedPitchers = pitching.filter((line) => line.ip3 >= 429);
  return {
    rows,
    league: {
      battingAverage: sum(batting, 'h') / Math.max(1, sum(batting, 'ab')),
      homeRuns: sum(batting, 'hr'),
      era:
        (pitching.reduce((total, line) => total + line.er, 0) * 27) /
        Math.max(
          1,
          pitching.reduce((total, line) => total + line.ip3, 0),
        ),
      homeRuns30Plus: batting.filter((line) => line.hr >= 30).length,
      battingAverage300Plus: qualifiedBatters.filter((line) => line.h / Math.max(1, line.ab) >= 0.3)
        .length,
      eraUnder2: qualifiedPitchers.filter((line) => (line.er * 27) / line.ip3 < 2).length,
    },
  };
}

function main() {
  const seasons = option('--seasons', 16);
  const seed = option('--seed', 20260801);
  const started = Date.now();
  const seasonsOut = [];
  try {
    for (let index = 0; index < seasons; index += 1) seasonsOut.push(simulateSeason(seed + index));
  } finally {
    resetRandom();
  }
  const rows = seasonsOut.flatMap((season) => season.rows);
  const perSeason = (pick: (rows: TeamSeason[]) => number) =>
    average(seasonsOut.map((season) => pick(season.rows)));
  const league = (key: keyof (typeof seasonsOut)[number]['league']) =>
    average(seasonsOut.map((season) => season.league[key]));
  const report = {
    seasons,
    seed,
    winPctStandardDeviation: perSeason((r) => standardDeviation(r.map((row) => row.winPct))),
    runsScored: {
      minimum: perSeason((r) => Math.min(...r.map((row) => row.runsScored))),
      maximum: perSeason((r) => Math.max(...r.map((row) => row.runsScored))),
      standardDeviation: perSeason((r) => standardDeviation(r.map((row) => row.runsScored))),
    },
    runsAllowed: {
      minimum: perSeason((r) => Math.min(...r.map((row) => row.runsAllowed))),
      maximum: perSeason((r) => Math.max(...r.map((row) => row.runsAllowed))),
      standardDeviation: perSeason((r) => standardDeviation(r.map((row) => row.runsAllowed))),
    },
    traitSpread: Object.fromEntries(
      (['defense', 'power', 'contact', 'discipline', 'starters', 'bullpen'] as const).map((key) => [
        key,
        perSeason((r) => standardDeviation(r.map((row) => row[key]))),
      ]),
    ),
    // Runs per rating point, from all team-seasons pooled.
    runsScoredPerPoint: Object.fromEntries(
      (['power', 'contact', 'discipline'] as const).map((key) => [
        key,
        slope(
          rows.map((row) => row[key]),
          rows.map((row) => row.runsScored),
        ),
      ]),
    ),
    runsAllowedPerPoint: Object.fromEntries(
      (['defense', 'starters', 'bullpen'] as const).map((key) => [
        key,
        slope(
          rows.map((row) => row[key]),
          rows.map((row) => row.runsAllowed),
        ),
      ]),
    ),
    league: {
      battingAverage: league('battingAverage'),
      era: league('era'),
      homeRuns: league('homeRuns'),
      homeRuns30Plus: league('homeRuns30Plus'),
      battingAverage300Plus: league('battingAverage300Plus'),
      eraUnder2: league('eraUnder2'),
    },
    seconds: Math.round((Date.now() - started) / 1000),
  };
  console.log(
    JSON.stringify(
      report,
      (_key, value) => (typeof value === 'number' ? Number(value.toFixed(3)) : value),
      2,
    ),
  );
}

main();
