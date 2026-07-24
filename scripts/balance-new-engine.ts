import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import {
  accumulateStatsAll,
  configureRandom,
  generateSchedule,
  initTeams,
  simulateGame,
  type AccumulatedStats,
  type PlayerStats,
  type TeamKey,
} from '../src/engine/index';
import { evaluateNpbScoringTargets, NPB_SCORING_TARGETS } from './npb-targets.mjs';
const DEFAULT_SEASONS = 100,
  DEFAULT_SEED = 20260723,
  DEFAULT_OUTPUT = 'baseline/new-season-stats.json';
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
function parseArguments(argv: string[]): { seasons: number; seed: number; output: string } {
  const options = { seasons: DEFAULT_SEASONS, seed: DEFAULT_SEED, output: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index],
      nextValue = argv[index + 1];
    if (argument === '--seasons' || argument === '-n') {
      if (!nextValue) throw new Error(`${argument} requires a value.`);
      options.seasons = parsePositiveInteger(nextValue, argument);
      index += 1;
    } else if (argument === '--seed') {
      if (!nextValue) throw new Error(`${argument} requires a value.`);
      options.seed = parsePositiveInteger(nextValue, argument);
      index += 1;
    } else if (argument === '--output' || argument === '-o') {
      if (!nextValue) throw new Error(`${argument} requires a value.`);
      options.output = nextValue;
      index += 1;
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}
function sumStats(lines: PlayerStats[], key: string): number {
  return lines.reduce((total, line) => {
    const value = (line as unknown as Record<string, unknown>)[key];
    return total + (typeof value === 'number' ? value : 0);
  }, 0);
}
const safeRatio = (numerator: number, denominator: number): number =>
  denominator > 0 ? numerator / denominator : 0;
function finalizeSeason(accumulatedStats: AccumulatedStats, games: number) {
  const lines = Object.values(accumulatedStats),
    batting = lines.filter((line) => line.type === 'bat'),
    pitching = lines.filter((line) => line.type === 'pit'),
    atBats = sumStats(batting, 'ab'),
    hits = sumStats(batting, 'h'),
    homeRuns = sumStats(batting, 'hr'),
    stolenBases = sumStats(batting, 'sb'),
    caughtStealing = sumStats(batting, 'cs'),
    walks = sumStats(batting, 'bb'),
    plateAppearances = sumStats(batting, 'pa'),
    earnedRuns = sumStats(pitching, 'er'),
    pitchingOuts = sumStats(pitching, 'ip3');
  return {
    games,
    battingAverage: safeRatio(hits, atBats),
    era: safeRatio(earnedRuns * 27, pitchingOuts),
    homeRuns,
    stolenBaseSuccessRate: safeRatio(stolenBases, stolenBases + caughtStealing),
    stolenBaseAttemptsPerTeamGame: safeRatio(stolenBases + caughtStealing, games * 2),
    walkRate: safeRatio(walks, plateAppearances),
  };
}
function summarize(values: number[]) {
  const mean = values.reduce((total, value) => total + value, 0) / values.length,
    variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return { mean, standardDeviation: Math.sqrt(variance) };
}
const roundSummary = (summary: { mean: number; standardDeviation: number }, digits: number) => ({
  mean: Number(summary.mean.toFixed(digits)),
  standardDeviation: Number(summary.standardDeviation.toFixed(digits)),
});
async function simulateSeason(seasonIndex: number, baseSeed: number) {
  const seed = baseSeed + seasonIndex;
  configureRandom(mulberry32(seed), () => Date.UTC(2024, 0, 1) + seed * 1_000);
  const teams = initTeams(),
    schedule = generateSchedule(2024 + seasonIndex, { rainoutRate: 0, maxRainouts: 0 }),
    rotations = Object.fromEntries(Object.keys(teams).map((teamKey) => [teamKey, 0])) as Record<
      TeamKey,
      number
    >;
  let accumulatedStats: AccumulatedStats = {};
  for (const game of schedule) {
    const result = simulateGame(
      game.homeKey,
      game.awayKey,
      teams,
      null,
      null,
      rotations[game.homeKey],
      rotations[game.awayKey],
      {},
    );
    accumulatedStats = accumulateStatsAll(result, accumulatedStats);
    rotations[game.homeKey] += 1;
    rotations[game.awayKey] += 1;
  }
  return finalizeSeason(accumulatedStats, schedule.length);
}
async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2)),
    seasonStats = [];
  for (let seasonIndex = 0; seasonIndex < options.seasons; seasonIndex += 1) {
    const stats = await simulateSeason(seasonIndex, options.seed);
    seasonStats.push(stats);
    console.log(
      `Season ${seasonIndex + 1}/${options.seasons}: AVG ${stats.battingAverage.toFixed(3)}, ERA ${stats.era.toFixed(2)}, HR ${stats.homeRuns}`,
    );
  }
  const summary = {
      battingAverage: roundSummary(summarize(seasonStats.map((stats) => stats.battingAverage)), 6),
      era: roundSummary(summarize(seasonStats.map((stats) => stats.era)), 6),
      homeRuns: roundSummary(summarize(seasonStats.map((stats) => stats.homeRuns)), 3),
      stolenBaseSuccessRate: roundSummary(
        summarize(seasonStats.map((stats) => stats.stolenBaseSuccessRate)),
        6,
      ),
      stolenBaseAttemptsPerTeamGame: roundSummary(
        summarize(seasonStats.map((stats) => stats.stolenBaseAttemptsPerTeamGame)),
        6,
      ),
      walkRate: roundSummary(summarize(seasonStats.map((stats) => stats.walkRate)), 6),
    },
    targetEvaluation = evaluateNpbScoringTargets(summary),
    output = {
      schemaVersion: 3,
      source: 'src/engine',
      seasons: options.seasons,
      seed: options.seed,
      targets: NPB_SCORING_TARGETS,
      targetEvaluation,
      summary,
    };
  const outputPath = resolve(options.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Baseline summary: ${JSON.stringify(output.summary)}`);
  console.log(`NPB target evaluation: ${JSON.stringify(targetEvaluation)}`);
  console.log(`Wrote ${options.seasons}-season new-engine baseline to ${outputPath}`);
  if (!targetEvaluation.passed) {
    console.error(
      'Initial engine scoring environment is outside the configured NPB target ranges.',
    );
    process.exitCode = 1;
  }
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
