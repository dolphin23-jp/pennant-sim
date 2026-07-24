import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import {
  accumulateStatsAll,
  calcOVR,
  configureRandom,
  generateSchedule,
  initTeams,
  simulateGame,
  type AccumulatedStats,
  type Player,
  type PlayerParams,
  type PlayerStats,
  type TeamKey,
  type Teams,
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
function populationStandardDeviation(values: number[]): number {
  if (!values.length) return 0;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  return Math.sqrt(values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length);
}
function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((first, second) => first - second),
    index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] as number;
}
function numericStat(line: PlayerStats | undefined, key: string): number {
  const value = (line as unknown as Record<string, unknown> | undefined)?.[key];
  return typeof value === 'number' ? value : 0;
}
function pearsonCorrelation(pairs: Array<{ x: number; y: number }>): number {
  if (pairs.length < 2) return 0;
  const xMean = pairs.reduce((sum, pair) => sum + pair.x, 0) / pairs.length,
    yMean = pairs.reduce((sum, pair) => sum + pair.y, 0) / pairs.length,
    numerator = pairs.reduce((sum, pair) => sum + (pair.x - xMean) * (pair.y - yMean), 0),
    xVariance = pairs.reduce((sum, pair) => sum + (pair.x - xMean) ** 2, 0),
    yVariance = pairs.reduce((sum, pair) => sum + (pair.y - yMean) ** 2, 0);
  return xVariance > 0 && yVariance > 0 ? numerator / Math.sqrt(xVariance * yVariance) : 0;
}
function awakeningPotentialGap(player: Player): number {
  const parameters: Array<keyof PlayerParams> = player.isP
    ? ['vel', 'ctrl', 'stam', 'nobi', 'fld']
    : [
        'cf',
        'cb',
        'pw',
        'dc',
        'sp',
        'df',
        'arm',
        ...(player.pos === '捕手' ? (['ld'] as Array<keyof PlayerParams>) : []),
      ];
  return Math.max(
    0,
    ...parameters.map(
      (parameter) =>
        Number(player.pot?.[parameter] ?? player.p?.[parameter] ?? 50) -
        Number(player.p?.[parameter] ?? 50),
    ),
  );
}
function rosterMetrics(teams: Teams) {
  const batters = Object.values(teams).flatMap((team) => team.fielders),
    pitchers = Object.values(teams).flatMap((team) => team.pitchers),
    allPlayers = [...batters, ...pitchers],
    batterOvrs = batters.map((player) => calcOVR(player, player.pos)),
    pitcherOvrs = pitchers.map((player) => calcOVR(player));
  return {
    batterOvrStandardDeviation: populationStandardDeviation(batterOvrs),
    pitcherOvrStandardDeviation: populationStandardDeviation(pitcherOvrs),
    batterOvrTop1Percent: percentile(batterOvrs, 0.99),
    batterOvrTop5Percent: percentile(batterOvrs, 0.95),
    pitcherOvrTop1Percent: percentile(pitcherOvrs, 0.99),
    pitcherOvrTop5Percent: percentile(pitcherOvrs, 0.95),
    batterOvr85PlusCount: batterOvrs.filter((overall) => overall >= 85).length,
    pitcherOvr85PlusCount: pitcherOvrs.filter((overall) => overall >= 85).length,
    latentFactorMaximumRate: safeRatio(
      allPlayers.filter((player) => awakeningPotentialGap(player) >= 20).length,
      allPlayers.length,
    ),
  };
}
function finalizeSeason(accumulatedStats: AccumulatedStats, games: number, teams: Teams) {
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
    pitchingOuts = sumStats(pitching, 'ip3'),
    playerById = new Map(
      Object.values(teams)
        .flatMap((team) => team.fielders)
        .map((player) => [player.id, player]),
    ),
    battingById = new Map(batting.map((line) => [line.id, line])),
    speedStolenBasePairs = [...playerById.values()]
      .map((player) => ({
        x: player.p.sp ?? 50,
        y: numericStat(battingById.get(player.id), 'sb'),
        pa: numericStat(battingById.get(player.id), 'pa'),
      }))
      .filter((pair) => pair.pa >= 50)
      .map(({ x, y }) => ({ x, y }));
  return {
    games,
    battingAverage: safeRatio(hits, atBats),
    era: safeRatio(earnedRuns * 27, pitchingOuts),
    homeRuns,
    stolenBaseSuccessRate: safeRatio(stolenBases, stolenBases + caughtStealing),
    stolenBaseAttemptsPerTeamGame: safeRatio(stolenBases + caughtStealing, games * 2),
    speedStolenBaseCorrelation: pearsonCorrelation(speedStolenBasePairs),
    walkRate: safeRatio(walks, plateAppearances),
    ...rosterMetrics(teams),
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
  return finalizeSeason(accumulatedStats, schedule.length, teams);
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
      speedStolenBaseCorrelation: roundSummary(
        summarize(seasonStats.map((stats) => stats.speedStolenBaseCorrelation)),
        6,
      ),
      walkRate: roundSummary(summarize(seasonStats.map((stats) => stats.walkRate)), 6),
      batterOvrStandardDeviation: roundSummary(
        summarize(seasonStats.map((stats) => stats.batterOvrStandardDeviation)),
        6,
      ),
      pitcherOvrStandardDeviation: roundSummary(
        summarize(seasonStats.map((stats) => stats.pitcherOvrStandardDeviation)),
        6,
      ),
      batterOvrTop1Percent: roundSummary(
        summarize(seasonStats.map((stats) => stats.batterOvrTop1Percent)),
        3,
      ),
      batterOvrTop5Percent: roundSummary(
        summarize(seasonStats.map((stats) => stats.batterOvrTop5Percent)),
        3,
      ),
      pitcherOvrTop1Percent: roundSummary(
        summarize(seasonStats.map((stats) => stats.pitcherOvrTop1Percent)),
        3,
      ),
      pitcherOvrTop5Percent: roundSummary(
        summarize(seasonStats.map((stats) => stats.pitcherOvrTop5Percent)),
        3,
      ),
      batterOvr85PlusCount: roundSummary(
        summarize(seasonStats.map((stats) => stats.batterOvr85PlusCount)),
        3,
      ),
      pitcherOvr85PlusCount: roundSummary(
        summarize(seasonStats.map((stats) => stats.pitcherOvr85PlusCount)),
        3,
      ),
      latentFactorMaximumRate: roundSummary(
        summarize(seasonStats.map((stats) => stats.latentFactorMaximumRate)),
        6,
      ),
    },
    targetEvaluation = evaluateNpbScoringTargets(summary),
    output = {
      schemaVersion: 3,
      source: 'src/engine',
      seasons: options.seasons,
      seed: options.seed,
      definitions: {
        battingAverage: 'hits / at-bats',
        era: 'earned runs * 27 / pitching outs',
        homeRuns: 'league-wide total per season',
        stolenBaseSuccessRate: 'stolen bases / (stolen bases + caught stealing)',
        stolenBaseAttemptsPerTeamGame: '(stolen bases + caught stealing) / (games * 2)',
        speedStolenBaseCorrelation:
          'Pearson correlation between player speed and seasonal stolen bases',
        batterOvrStandardDeviation: 'population standard deviation of initial batter OVR',
        pitcherOvrStandardDeviation: 'population standard deviation of initial pitcher OVR',
        batterOvrTop1Percent: '99th percentile threshold of initial batter OVR',
        batterOvrTop5Percent: '95th percentile threshold of initial batter OVR',
        pitcherOvrTop1Percent: '99th percentile threshold of initial pitcher OVR',
        pitcherOvrTop5Percent: '95th percentile threshold of initial pitcher OVR',
        batterOvr85PlusCount: 'league-wide initial batters with OVR at least 85',
        pitcherOvr85PlusCount: 'league-wide initial pitchers with OVR at least 85',
        latentFactorMaximumRate:
          'share of initial players with awakening potential gap at least 20',
      },
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
