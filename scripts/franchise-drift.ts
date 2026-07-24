import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

import {
  accumulateStatsAll,
  calcOVR,
  configureRandom,
  effectiveOVR,
  generateSchedule,
  initTeams,
  resetRandom,
  runAutomatedOffseason,
  simulateGame,
  type AccumulatedStats,
  type DraftPick,
  type Player,
  type PlayerStats,
  type RosterExit,
  type TeamKey,
  type Teams,
} from '../src/engine/index';
import { evaluateNpbScoringTargets, NPB_SCORING_TARGETS } from './npb-targets.mjs';

const DEFAULT_START_YEAR = 2026;
const DEFAULT_YEARS = 25;
const DEFAULT_SEED = 20260724;
const DEFAULT_OUTPUT = 'baseline/franchise-drift.json';
const DRAFT_ROUNDS = 6;

type RosterCaps = Record<TeamKey, { pitchers: number; fielders: number; total: number }>;

interface CliOptions {
  startYear: number;
  years: number;
  seed: number;
  output: string;
}

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

function parsePositiveInteger(value: string, flagName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`${flagName} must be a positive integer.`);
  return parsed;
}

function parseArguments(argv: string[]): CliOptions {
  const options: CliOptions = {
    startYear: DEFAULT_START_YEAR,
    years: DEFAULT_YEARS,
    seed: DEFAULT_SEED,
    output: DEFAULT_OUTPUT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if (argument === '--start-year') {
      if (!next) throw new Error(`${argument} requires a value.`);
      options.startYear = parsePositiveInteger(next, argument);
      index += 1;
    } else if (argument === '--years' || argument === '-n') {
      if (!next) throw new Error(`${argument} requires a value.`);
      options.years = parsePositiveInteger(next, argument);
      index += 1;
    } else if (argument === '--seed') {
      if (!next) throw new Error(`${argument} requires a value.`);
      options.seed = parsePositiveInteger(next, argument);
      index += 1;
    } else if (argument === '--output' || argument === '-o') {
      if (!next) throw new Error(`${argument} requires a value.`);
      options.output = next;
      index += 1;
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

const round = (value: number, digits = 3): number => Number(value.toFixed(digits));
const ratio = (numerator: number, denominator: number): number =>
  denominator > 0 ? numerator / denominator : 0;
const average = (values: number[]): number =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;

function standardDeviation(values: number[]): number {
  if (!values.length) return 0;
  const mean = average(values);
  return Math.sqrt(values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length);
}

function playerOvr(player: Player): number {
  return player.isP ? calcOVR(player) : effectiveOVR(player, player.pos);
}

function teamKeys(teams: Teams): TeamKey[] {
  return Object.keys(teams) as TeamKey[];
}

function initialRosterCaps(teams: Teams): RosterCaps {
  return Object.fromEntries(
    teamKeys(teams).map((teamKey) => {
      const team = teams[teamKey];
      return [
        teamKey,
        {
          pitchers: team.pitchers.length,
          fielders: team.fielders.length,
          total: team.pitchers.length + team.fielders.length,
        },
      ];
    }),
  ) as RosterCaps;
}

function rosterSnapshot(teams: Teams) {
  const rows = teamKeys(teams).map((teamKey) => {
    const team = teams[teamKey];
    const pitcherOvrs = team.pitchers.map(playerOvr);
    const fielderOvrs = team.fielders.map(playerOvr);
    const players = [...team.pitchers, ...team.fielders];
    return {
      teamKey,
      players: players.length,
      pitchers: team.pitchers.length,
      fielders: team.fielders.length,
      averageAge: round(average(players.map((player) => player.age)), 2),
      averageOvr: round(average([...pitcherOvrs, ...fielderOvrs]), 3),
      pitcherOvr: round(average(pitcherOvrs), 3),
      fielderOvr: round(average(fielderOvrs), 3),
    };
  });
  const pitchers = teamKeys(teams).flatMap((teamKey) => teams[teamKey].pitchers);
  const fielders = teamKeys(teams).flatMap((teamKey) => teams[teamKey].fielders);
  const players = [...pitchers, ...fielders];
  const ranked = [...rows].sort((first, second) => first.averageOvr - second.averageOvr);
  const weakest = ranked[0];
  const strongest = ranked.at(-1);
  return {
    players: players.length,
    pitchers: pitchers.length,
    fielders: fielders.length,
    averageAge: round(average(players.map((player) => player.age)), 3),
    oldestAge: Math.max(...players.map((player) => player.age)),
    averageOvr: {
      overall: round(average(players.map(playerOvr)), 3),
      pitchers: round(average(pitchers.map(playerOvr)), 3),
      fielders: round(average(fielders.map(playerOvr)), 3),
    },
    teamOvrDistribution: {
      minimum: weakest ? { teamKey: weakest.teamKey, value: weakest.averageOvr } : null,
      maximum: strongest ? { teamKey: strongest.teamKey, value: strongest.averageOvr } : null,
      gap: round((strongest?.averageOvr ?? 0) - (weakest?.averageOvr ?? 0), 3),
      standardDeviation: round(standardDeviation(rows.map((team) => team.averageOvr)), 3),
    },
    teams: rows,
  };
}

type RosterSnapshot = ReturnType<typeof rosterSnapshot>;

function sumStats(lines: PlayerStats[], key: string): number {
  return lines.reduce((total, line) => {
    const value = (line as unknown as Record<string, unknown>)[key];
    return total + (typeof value === 'number' ? value : 0);
  }, 0);
}

function leader<T extends PlayerStats>(
  lines: T[],
  value: (line: T) => number,
): { name: string; value: number } | null {
  const top = [...lines].sort((first, second) => value(second) - value(first))[0];
  return top ? { name: top.name, value: round(value(top), 3) } : null;
}

function seasonSnapshot(stats: AccumulatedStats, games: number, totalRuns: number) {
  const lines = Object.values(stats);
  const batting = lines.filter((line) => line.type === 'bat');
  const pitching = lines.filter((line) => line.type === 'pit');
  const atBats = sumStats(batting, 'ab');
  const hits = sumStats(batting, 'h');
  const homeRuns = sumStats(batting, 'hr');
  const walks = sumStats(batting, 'bb');
  const strikeouts = sumStats(batting, 'k');
  const plateAppearances = sumStats(batting, 'pa');
  const stolenBases = sumStats(batting, 'sb');
  const caughtStealing = sumStats(batting, 'cs');
  const earnedRuns = sumStats(pitching, 'er');
  const pitchingOuts = sumStats(pitching, 'ip3');
  const qualifiedPitchers = pitching.filter((line) => line.ip3 >= 143 * 3);
  const reliefPitchers = pitching.filter((line) => line.gs <= 2);
  const pitcherEra = (line: (typeof pitching)[number]): number => ratio(line.er * 27, line.ip3);
  return {
    games,
    battingAverage: round(ratio(hits, atBats), 6),
    babip: round(ratio(hits - homeRuns, atBats - strikeouts - homeRuns), 6),
    era: round(ratio(earnedRuns * 27, pitchingOuts), 6),
    homeRuns,
    homeRunsPerGame: round(ratio(homeRuns, games), 4),
    runsPerTeamGame: round(ratio(totalRuns, games * 2), 4),
    walkRate: round(ratio(walks, plateAppearances), 6),
    strikeoutRate: round(ratio(strikeouts, plateAppearances), 6),
    stolenBaseAttemptsPerTeamGame: round(ratio(stolenBases + caughtStealing, games * 2), 6),
    stolenBaseSuccessRate: round(ratio(stolenBases, stolenBases + caughtStealing), 6),
    individualDistributions: {
      batting: {
        homeRuns30Plus: batting.filter((line) => line.hr >= 30).length,
        runsBattedIn100Plus: batting.filter((line) => line.rbi >= 100).length,
        homeRunLeader: leader(batting, (line) => line.hr),
        runsBattedInLeader: leader(batting, (line) => line.rbi),
      },
      pitching: {
        qualifiedPitchers: qualifiedPitchers.length,
        eraBelowTwo: qualifiedPitchers.filter((line) => pitcherEra(line) < 2).length,
        strikeouts200Plus: pitching.filter((line) => line.k >= 200).length,
        strikeoutLeader: leader(pitching, (line) => line.k),
        reliefAppearances70Plus: reliefPitchers.filter((line) => line.g >= 70).length,
        reliefAppearanceLeader: leader(reliefPitchers, (line) => line.g),
      },
    },
  };
}

type SeasonSnapshot = ReturnType<typeof seasonSnapshot>;

function retirementSummary(retired: RosterExit[]) {
  const byReason: Record<RosterExit['reason'], number> = {
    mandatoryRetirement: 0,
    ageAndPerformance: 0,
    draftOpportunity: 0,
    rosterCompetition: 0,
  };
  for (const player of retired) byReason[player.reason] += 1;
  return {
    total: retired.length,
    pitchers: retired.filter((player) => player.isPitcher).length,
    fielders: retired.filter((player) => !player.isPitcher).length,
    averageAge: round(average(retired.map((player) => player.age)), 2),
    averageOvr: round(average(retired.map((player) => player.ovr)), 3),
    byReason,
  };
}

function draftSummary(picks: DraftPick[]) {
  return {
    total: picks.length,
    pitchers: picks.filter((player) => player.isP).length,
    fielders: picks.filter((player) => !player.isP).length,
    averageAge: round(average(picks.map((player) => player.age)), 2),
    averageOvr: round(average(picks.map(playerOvr)), 3),
  };
}

interface YearReport {
  year: number;
  seasonIndex: number;
  openingRoster: RosterSnapshot;
  season: SeasonSnapshot;
  targetEvaluation: ReturnType<typeof evaluateNpbScoringTargets>;
  offseason: {
    awakeningEvents: number;
    retirements: ReturnType<typeof retirementSummary>;
    draft: ReturnType<typeof draftSummary>;
    freeAgentSignings: number;
    foreignSignings: number;
  };
  closingRoster: RosterSnapshot;
}

function driftSummary(years: YearReport[]) {
  const first = years[0];
  const last = years.at(-1);
  if (!first || !last) throw new Error('At least one franchise season is required.');
  const largestGap = years
    .map((year) => ({ year: year.year, value: year.closingRoster.teamOvrDistribution.gap }))
    .sort((firstRow, secondRow) => secondRow.value - firstRow.value)[0];
  const requiredEndpointsPassed = first.targetEvaluation.passed && last.targetEvaluation.passed;
  return {
    firstYear: first.year,
    finalYear: last.year,
    rosterSizeChange: last.closingRoster.players - first.openingRoster.players,
    openingToFinalClosingOvrChange: {
      overall: round(
        last.closingRoster.averageOvr.overall - first.openingRoster.averageOvr.overall,
        3,
      ),
      pitchers: round(
        last.closingRoster.averageOvr.pitchers - first.openingRoster.averageOvr.pitchers,
        3,
      ),
      fielders: round(
        last.closingRoster.averageOvr.fielders - first.openingRoster.averageOvr.fielders,
        3,
      ),
    },
    firstToFinalSeasonChange: {
      battingAverage: round(last.season.battingAverage - first.season.battingAverage, 6),
      era: round(last.season.era - first.season.era, 6),
      homeRuns: last.season.homeRuns - first.season.homeRuns,
    },
    largestClosingTeamOvrGap: largestGap,
    npbTargetEvaluation: {
      firstSeason: first.targetEvaluation,
      finalSeason: last.targetEvaluation,
      allSeasonsPassed: years.every((year) => year.targetEvaluation.passed),
      requiredEndpointsPassed,
    },
  };
}

async function simulateFranchise(options: CliOptions) {
  let clock = Date.UTC(options.startYear, 0, 1);
  configureRandom(mulberry32(options.seed), () => clock++);
  try {
    let teams = initTeams();
    const caps = initialRosterCaps(teams);
    const years: YearReport[] = [];
    for (let seasonIndex = 0; seasonIndex < options.years; seasonIndex += 1) {
      const year = options.startYear + seasonIndex;
      const openingRoster = rosterSnapshot(teams);
      const schedule = generateSchedule(year, { rainoutRate: 0, maxRainouts: 0 });
      const rotations = Object.fromEntries(
        teamKeys(teams).map((teamKey) => [teamKey, 0]),
      ) as Record<TeamKey, number>;
      let accumulated: AccumulatedStats = {};
      let totalRuns = 0;
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
        );
        accumulated = accumulateStatsAll(result, accumulated);
        totalRuns += result.score.home + result.score.away;
        rotations[game.homeKey] += 1;
        rotations[game.awayKey] += 1;
      }
      const season = seasonSnapshot(accumulated, schedule.length, totalRuns);
      const targetEvaluation = evaluateNpbScoringTargets(season);
      const offseason = runAutomatedOffseason(teams, { draftRounds: DRAFT_ROUNDS });
      teams = offseason.teams;
      const closingRoster = rosterSnapshot(teams);
      if (closingRoster.players !== openingRoster.players)
        throw new Error(
          `Roster size drifted from ${openingRoster.players} to ${closingRoster.players}.`,
        );
      years.push({
        year,
        seasonIndex: seasonIndex + 1,
        openingRoster,
        season,
        targetEvaluation,
        offseason: {
          awakeningEvents: offseason.awakeningEvents.length,
          retirements: retirementSummary(offseason.exits),
          draft: draftSummary(offseason.draftPicks),
          freeAgentSignings: offseason.freeAgentSignings,
          foreignSignings: offseason.foreignSignings,
        },
        closingRoster,
      });
      console.log(
        `${year}: AVG ${season.battingAverage.toFixed(3)}, ERA ${season.era.toFixed(2)}, ` +
          `HR ${season.homeRuns}, target ${targetEvaluation.passed ? 'PASS' : 'FAIL'} | ` +
          `OVR F ${openingRoster.averageOvr.fielders.toFixed(1)}→${closingRoster.averageOvr.fielders.toFixed(1)}, ` +
          `P ${openingRoster.averageOvr.pitchers.toFixed(1)}→${closingRoster.averageOvr.pitchers.toFixed(1)} | ` +
          `exited ${offseason.exits.length}, drafted ${offseason.draftPicks.length}, ` +
          `FA ${offseason.freeAgentSignings}, foreign ${offseason.foreignSignings}`,
      );
    }
    return {
      schemaVersion: 3,
      source: 'continuous-franchise-diagnostic',
      targets: NPB_SCORING_TARGETS,
      configuration: {
        startYear: options.startYear,
        seasons: options.years,
        seed: options.seed,
        weather: 'disabled to isolate roster and growth drift',
        draftRounds: DRAFT_ROUNDS,
        initialRosterCaps: caps,
        offseasonEngine: {
          scope: 'shared with production CPU roster management',
          rosterTargets: { pitchers: 28, fielders: 35 },
          minimumRoster: { pitchers: 18, fielders: 22 },
          stages: [
            'growth',
            'CPU roster preparation',
            'free agency',
            'foreign market',
            'draft',
            'final roster competition',
          ],
        },
      },
      investigation: {
        cpuAutomaticRetirementFound: true,
        finding:
          'Production CPU teams and this diagnostic now share the same offseason lifecycle engine.',
      },
      summary: driftSummary(years),
      years,
    };
  } finally {
    resetRandom();
  }
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const report = await simulateFranchise(options);
  const outputPath = resolve(options.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${options.years}-season franchise drift report to ${outputPath}`);
  if (!report.summary.npbTargetEvaluation.requiredEndpointsPassed) {
    console.error(
      'The first or final franchise season is outside the configured NPB target ranges.',
    );
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
